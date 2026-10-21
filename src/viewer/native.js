// Client for the optional native messaging host (native/), which adds direct file
// writes, directory listing, a command runner and Claude Code / Codex agents.
export const HOST = 'com.markcraft.host';
let port = null;
let seq = 0;
const pending = new Map();
let status = null; // null = unknown, false = unavailable, object = ping result

function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener((msg) => {
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'event') return p.onEvent?.(msg);
    pending.delete(msg.id);
    msg.type === 'error' ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
  });
  port.onDisconnect.addListener(() => {
    const err = new Error(chrome.runtime.lastError?.message || 'Native host disconnected');
    port = null;
    status = false;
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  });
  return port;
}

export function call(type, params = {}, onEvent) {
  return new Promise((resolve, reject) => {
    let p;
    try {
      p = connect();
    } catch (e) {
      return reject(e);
    }
    const id = ++seq;
    pending.set(id, { resolve, reject, onEvent });
    p.postMessage({ id, type, ...params });
  });
}

export async function ping(force = false) {
  if (status !== null && !force) return status;
  try {
    status = await Promise.race([call('ping'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))]);
  } catch {
    status = false;
  }
  return status;
}

export function cancel(jobId) {
  return call('cancel', { job: jobId }).catch(() => {});
}
