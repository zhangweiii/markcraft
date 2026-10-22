"""MarkCraft native messaging host.

Gives the extension what a browser can't do on its own: write file:// documents,
run Claude Code / Codex on an isolated copy of a document, and run shell commands.
Speaks Chrome's native messaging protocol (4-byte length + JSON) on stdin/stdout.
"""
import json
import os
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import threading

VERSION = "1.0.0"
CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
EXTRA_PATH = ["~/.local/bin", "~/.claude/local", "/opt/homebrew/bin", "/usr/local/bin", "~/.npm-global/bin", "~/.bun/bin", "~/.cargo/bin"]

out_lock = threading.Lock()
jobs = {}


def send(msg):
    data = json.dumps(msg).encode("utf-8")
    with out_lock:
        sys.stdout.buffer.write(struct.pack("<I", len(data)))
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    (length,) = struct.unpack("<I", raw)
    return json.loads(sys.stdin.buffer.read(length).decode("utf-8"))


def load_config():
    try:
        with open(CONFIG) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def env():
    e = dict(os.environ)
    cfg = load_config()
    parts = [os.path.expanduser(p) for p in EXTRA_PATH]
    if cfg.get("path"):
        parts.insert(0, cfg["path"])
    e["PATH"] = os.pathsep.join(parts + [e.get("PATH", "/usr/bin:/bin")])
    e.setdefault("HOME", os.path.expanduser("~"))
    e.setdefault("LANG", "en_US.UTF-8")
    return e


def which(name):
    cfg = load_config().get("clis", {})
    if cfg.get(name) and os.path.exists(cfg[name]):
        return cfg[name]
    return shutil.which(name, path=env()["PATH"])


# ---------- handlers ----------

def h_ping(msg):
    return {"version": VERSION, "home": os.path.expanduser("~"), "clis": {"claude": which("claude"), "codex": which("codex")}}


def h_read(msg):
    with open(msg["path"], encoding="utf-8") as f:
        text = f.read()
    return {"text": text, "mtime": os.path.getmtime(msg["path"])}


def h_write(msg):
    path = msg["path"]
    tmp = path + ".markcraft-tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(msg["text"])
    try:
        shutil.copymode(path, tmp)
    except OSError:
        pass
    os.replace(tmp, path)
    return {"mtime": os.path.getmtime(path)}


def h_stat(msg):
    st = os.stat(msg["path"])
    return {"mtime": st.st_mtime, "size": st.st_size}


def h_list(msg):
    entries = []
    with os.scandir(msg["dir"]) as it:
        for e in it:
            entries.append({"name": e.name, "dir": e.is_dir()})
    return {"entries": entries}


def stream_process(job, cmd, cwd, on_line):
    """Run cmd, forwarding output lines via on_line(text, stream). Returns exit code."""
    proc = subprocess.Popen(
        cmd, cwd=cwd, env=env(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL,
        shell=isinstance(cmd, str), start_new_session=True,
    )
    jobs[job] = proc

    def pump(pipe, name):
        for raw in iter(pipe.readline, b""):
            on_line(raw.decode("utf-8", "replace"), name)
        pipe.close()

    t_err = threading.Thread(target=pump, args=(proc.stderr, "stderr"), daemon=True)
    t_err.start()
    pump(proc.stdout, "stdout")
    t_err.join()
    code = proc.wait()
    jobs.pop(job, None)
    return code


def summarize_claude_event(line):
    """Turn a stream-json line from `claude -p` into a short human-readable log line."""
    try:
        ev = json.loads(line)
    except ValueError:
        return line.rstrip("\n"), "dim"
    kind = ev.get("type")
    if kind == "assistant":
        parts = []
        for c in ev.get("message", {}).get("content", []):
            if c.get("type") == "text" and c.get("text", "").strip():
                parts.append((c["text"].strip(), ""))
            elif c.get("type") == "tool_use":
                inp = c.get("input", {})
                arg = inp.get("file_path") or inp.get("command") or inp.get("pattern") or inp.get("path") or ""
                parts.append((f"▸ {c.get('name')} {arg}".rstrip(), "tool"))
        return parts or None, None
    if kind == "result":
        cost = ev.get("total_cost_usd")
        return f"Done in {ev.get('duration_ms', 0) / 1000:.1f}s" + (f" · ${cost:.4f}" if cost else ""), "dim"
    if kind == "system" and ev.get("subtype") == "init":
        return f"Session started ({ev.get('model', 'claude')})", "dim"
    return None, None


def h_agent(msg):
    job = msg["job"]
    cli = msg.get("cli", "claude")
    exe = which(cli)
    if not exe:
        raise RuntimeError(f"{cli} CLI not found. Install it or set its path in native/config.json.")
    work = tempfile.mkdtemp(prefix="markcraft-agent-")
    name = os.path.basename(msg.get("name") or "document.md")
    doc = os.path.join(work, name)
    with open(doc, "w", encoding="utf-8", newline="") as f:
        f.write(msg["text"])
    ctx_dir = msg.get("contextDir")
    instructions = (
        f"You are editing the Markdown file ./{name} in the current directory. "
        f"It is an isolated working copy of the user's document `{msg.get('docPath') or name}`. "
        "Apply the requested changes by editing ./" + name + " in place. Do not create other files. "
        + (f"You may read files under {ctx_dir} for context but must not modify anything there. " if ctx_dir else "")
        + "When finished, reply with a one-paragraph summary of what you changed.\n\nTask:\n"
        + msg["task"]
    )

    def emit(text, stream):
        send({"id": msg["id"], "type": "event", "text": text, "stream": stream})

    if cli == "claude":
        cmd = [exe, "-p", instructions, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
               "--allowedTools", "Read,Edit,Write,MultiEdit,Glob,Grep,LS"]
        if ctx_dir and os.path.isdir(ctx_dir):
            cmd += ["--add-dir", ctx_dir]

        def on_line(line, stream):
            if stream == "stderr":
                return emit(line.rstrip("\n"), "stderr")
            text, cls = summarize_claude_event(line)
            if isinstance(text, list):
                for t, c in text:
                    emit(t, c)
            elif text:
                emit(text, cls or "")
    else:
        cmd = [exe, "exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "-C", work, instructions]

        def on_line(line, stream):
            if line.strip():
                emit(line.rstrip("\n"), "dim" if stream == "stderr" else "")

    emit(f"$ {cli} (working copy in {work})", "dim")
    code = stream_process(job, cmd, work, on_line)
    try:
        with open(doc, encoding="utf-8") as f:
            result = f.read()
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return {"exitCode": code, "text": result}


def h_exec(msg):
    cwd = os.path.expanduser(msg.get("cwd") or "~")
    if not os.path.isdir(cwd):
        cwd = os.path.expanduser("~")
    cmd = msg["cmd"].strip()
    # `cd` changes the panel's working directory instead of running in a subshell.
    if cmd == "cd" or cmd.startswith("cd "):
        target = os.path.expanduser(cmd[3:].strip() or "~")
        new = os.path.normpath(os.path.join(cwd, target))
        if not os.path.isdir(new):
            raise RuntimeError(f"cd: no such directory: {target}")
        return {"exitCode": 0, "cwd": new}

    def on_line(line, stream):
        send({"id": msg["id"], "type": "event", "text": line, "stream": stream})

    shell = os.environ.get("SHELL", "/bin/zsh")
    code = stream_process(msg["job"], [shell, "-lc", cmd], cwd, on_line)
    return {"exitCode": code, "cwd": cwd}


def h_cancel(msg):
    proc = jobs.get(msg.get("job"))
    if proc:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except OSError:
            proc.terminate()
    return {"cancelled": bool(proc)}


HANDLERS = {"ping": h_ping, "read": h_read, "write": h_write, "stat": h_stat, "list": h_list,
            "agent": h_agent, "exec": h_exec, "cancel": h_cancel}
LONG_RUNNING = {"agent", "exec"}


def handle(msg):
    handler = HANDLERS.get(msg.get("type"))
    if not handler:
        return send({"id": msg.get("id"), "type": "error", "error": f"Unknown request {msg.get('type')!r}"})
    try:
        send({"id": msg.get("id"), "type": "result", "result": handler(msg)})
    except Exception as e:  # report every failure back to the page
        send({"id": msg.get("id"), "type": "error", "error": str(e)})


def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        if msg.get("type") in LONG_RUNNING:
            threading.Thread(target=handle, args=(msg,), daemon=True).start()
        else:
            handle(msg)
    for proc in list(jobs.values()):
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except OSError:
            pass


if __name__ == "__main__":
    main()
