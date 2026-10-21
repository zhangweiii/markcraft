// "Ask Agent" and terminal panels backed by the native host. The agent always
// works on an isolated copy of the current buffer; its result is shown as a diff
// and only applied when the user accepts it.
import * as native from './native.js';
import { renderDiff, diffStats } from './diffview.js';
import { escapeHtml } from './render.js';

const INSTALL_CMD = 'cd /path/to/markcraft && ./native/install.sh';

export class AgentPanel {
  constructor({ el, getDoc, onApply, getSettings, saveSettings, toast }) {
    this.el = el;
    this.getDoc = getDoc;
    this.onApply = onApply;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
    this.toast = toast;
    this.prompt = el.querySelector('#agent-prompt');
    this.cli = el.querySelector('#agent-cli');
    this.log = el.querySelector('#agent-log');
    this.runBtn = el.querySelector('[data-act="agent-run"]');
    this.stopBtn = el.querySelector('[data-act="agent-stop"]');
    this.status = el.querySelector('#agent-status');
    this.result = el.querySelector('#agent-result');

    this.runBtn.addEventListener('click', () => this.run());
    this.stopBtn.addEventListener('click', () => this.stop());
    this.cli.addEventListener('change', () => this.saveSettings({ agentCli: this.cli.value }));
    this.prompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.run(); }
    });
    el.querySelector('[data-act="agent-copy"]').addEventListener('click', async () => {
      await navigator.clipboard.writeText(this.fullPrompt());
      this.toast('Prompt copied — paste it into Claude Code, Codex or any agent');
    });
  }

  async refresh() {
    const s = this.getSettings();
    this.cli.value = s.agentCli;
    const st = await native.ping();
    const box = this.el.querySelector('#agent-host');
    if (!st) {
      box.hidden = false;
      box.innerHTML = `<b>Native helper not installed.</b> Running agents and the terminal needs the small local helper that ships with MarkCraft. In a terminal run:<pre>${escapeHtml(INSTALL_CMD)}</pre>then reload this page. Until then, use <i>Copy prompt</i> to hand the task to your agent manually.<br><button class="btn small" data-act="host-retry">Check again</button>`;
      box.querySelector('[data-act="host-retry"]').onclick = async () => { await native.ping(true); this.refresh(); };
      this.runBtn.disabled = true;
      return;
    }
    box.hidden = true;
    this.runBtn.disabled = !!this.job;
    for (const opt of this.cli.options) {
      opt.disabled = !st.clis?.[opt.value];
      opt.textContent = opt.dataset.label + (st.clis?.[opt.value] ? '' : ' (not found)');
    }
  }

  setPrompt(text) {
    this.prompt.value = text;
    this.prompt.focus();
  }

  fullPrompt() {
    const doc = this.getDoc();
    return `${this.prompt.value.trim()}\n\n(The document is \`${doc.path}\`.)`;
  }

  appendLog(text, cls = '') {
    const line = document.createElement('div');
    line.className = 'log-line ' + cls;
    line.textContent = text;
    this.log.append(line);
    this.log.scrollTop = this.log.scrollHeight;
  }

  async run() {
    const task = this.prompt.value.trim();
    if (!task || this.job) return;
    const doc = this.getDoc();
    this.log.innerHTML = '';
    this.result.hidden = true;
    this.status.textContent = 'Running…';
    this.el.classList.add('running');
    this.runBtn.disabled = true;
    this.stopBtn.hidden = false;
    const original = doc.text;
    this.job = Date.now();
    try {
      const res = await native.call(
        'agent',
        { job: this.job, cli: this.cli.value, task, name: doc.name, text: original, contextDir: doc.dirPath || null, docPath: doc.path },
        (ev) => this.appendLog(ev.text, ev.stream || ''),
      );
      this.status.textContent = res.exitCode === 0 ? 'Finished' : `Exited with code ${res.exitCode}`;
      this.showResult(original, res.text);
    } catch (e) {
      this.status.textContent = 'Failed';
      this.appendLog(e.message, 'stderr');
    } finally {
      this.job = null;
      this.el.classList.remove('running');
      this.runBtn.disabled = false;
      this.stopBtn.hidden = true;
    }
  }

  stop() {
    if (this.job) native.cancel(this.job);
  }

  showResult(original, next) {
    this.result.hidden = false;
    if (next === original || next == null) {
      this.result.innerHTML = '<div class="empty-hint">The agent made no changes to the document.</div>';
      return;
    }
    const { added, removed } = diffStats(original, next);
    this.result.innerHTML = `<div class="result-head"><b>Proposed changes</b> <span class="stat add">+${added}</span> <span class="stat del">−${removed}</span>
      <span class="spacer"></span><button class="btn small" data-act="discard">Discard</button><button class="btn small" data-act="apply">Apply</button><button class="btn small primary" data-act="apply-save">Apply &amp; Save</button></div>
      <div class="diff">${renderDiff(original, next)}</div>`;
    this.result.querySelector('[data-act="discard"]').onclick = () => { this.result.hidden = true; };
    this.result.querySelector('[data-act="apply"]').onclick = () => { this.onApply(next, false); this.result.hidden = true; };
    this.result.querySelector('[data-act="apply-save"]').onclick = () => { this.onApply(next, true); this.result.hidden = true; };
  }
}

export class TerminalPanel {
  constructor({ el, getCwd }) {
    this.el = el;
    this.getCwd = getCwd;
    this.input = el.querySelector('#term-input');
    this.out = el.querySelector('#term-out');
    this.history = JSON.parse(localStorage.getItem('mc-term-history') || '[]');
    this.hpos = this.history.length;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.exec(this.input.value); }
      if (e.key === 'ArrowUp' && this.hpos > 0) { e.preventDefault(); this.input.value = this.history[--this.hpos]; }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.hpos = Math.min(this.history.length, this.hpos + 1); this.input.value = this.history[this.hpos] || ''; }
      if (e.key === 'c' && e.ctrlKey && this.job) { e.preventDefault(); native.cancel(this.job); }
    });
    el.querySelector('[data-act="term-clear"]').addEventListener('click', () => (this.out.innerHTML = ''));
  }

  async refresh() {
    const st = await native.ping();
    this.el.querySelector('#term-host').hidden = !!st;
    this.input.disabled = !st;
    this.cwd ||= this.getCwd() || st?.home || '~';
    this.el.querySelector('#term-cwd').textContent = this.cwd;
  }

  print(text, cls = '') {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    this.out.append(span);
    this.out.scrollTop = this.out.scrollHeight;
  }

  async exec(cmd) {
    cmd = cmd.trim();
    if (!cmd || this.job) return;
    this.history = [...this.history.filter((h) => h !== cmd), cmd].slice(-100);
    this.hpos = this.history.length;
    localStorage.setItem('mc-term-history', JSON.stringify(this.history));
    this.input.value = '';
    this.print(`$ ${cmd}\n`, 'cmd');
    this.job = Date.now();
    try {
      const res = await native.call('exec', { job: this.job, cmd, cwd: this.cwd }, (ev) => this.print(ev.text, ev.stream));
      if (res.cwd) { this.cwd = res.cwd; this.el.querySelector('#term-cwd').textContent = this.cwd; }
      if (res.exitCode) this.print(`[exit ${res.exitCode}]\n`, 'stderr');
    } catch (e) {
      this.print(e.message + '\n', 'stderr');
    } finally {
      this.job = null;
    }
  }
}
