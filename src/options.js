import { DEFAULTS, getSettings, setSettings } from './shared/settings.js';
import { db } from './shared/db.js';

const form = document.querySelector('main');
const saved = document.getElementById('saved');

async function load() {
  const s = await getSettings();
  for (const el of form.querySelectorAll('[name]')) {
    if (el.type === 'checkbox') el.checked = !!s[el.name];
    else el.value = s[el.name];
  }
}

form.addEventListener('change', async (e) => {
  const el = e.target;
  if (!el.name) return;
  const value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  await setSettings({ [el.name]: value });
  saved.textContent = 'Saved ✓';
  setTimeout(() => (saved.textContent = ''), 1500);
});

document.getElementById('ext').onclick = () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
document.getElementById('ext-id').textContent = chrome.runtime.id;
document.getElementById('clear-recent').onclick = async () => { await db.clear('recent'); saved.textContent = 'Recent documents cleared'; };
document.getElementById('clear-comments').onclick = async () => {
  if (confirm('Delete all review comments for all documents?')) { await db.clear('comments'); saved.textContent = 'Comments deleted'; }
};
document.getElementById('reset').onclick = async () => { await chrome.storage.sync.set({ settings: DEFAULTS }); load(); };

const status = document.getElementById('host-status');
try {
  const port = chrome.runtime.connectNative('com.markcraft.host');
  const t = setTimeout(() => { status.textContent = 'Native helper not responding.'; status.className = 'hint bad'; }, 2500);
  port.onMessage.addListener((m) => {
    clearTimeout(t);
    const clis = Object.entries(m.result?.clis || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none found';
    status.textContent = `Native helper installed (v${m.result?.version}). Agents available: ${clis}.`;
    status.className = 'hint ok';
    port.disconnect();
  });
  port.onDisconnect.addListener(() => {
    clearTimeout(t);
    if (!status.className.includes('ok')) { status.textContent = 'Native helper not installed — agent and terminal features are disabled.'; status.className = 'hint bad'; }
  });
  port.postMessage({ id: 1, type: 'ping' });
} catch {
  status.textContent = 'Native messaging unavailable.';
}

load();
