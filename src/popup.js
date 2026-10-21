import { getRecent, db } from './shared/db.js';
import { getSettings, setSettings } from './shared/settings.js';
import { setLanguage, localize, t } from './shared/i18n.js';
import { hydrateIcons, icon } from './shared/icons.js';

const VIEWER = chrome.runtime.getURL('viewer.html');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const open = (q, newTab = true) => { chrome.tabs.create({ url: VIEWER + q, active: true }); window.close(); };

let items = [];

function render() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const list = items.filter((r) => !q || (r.name + ' ' + r.path).toLowerCase().includes(q));
  const ul = document.getElementById('recent');
  if (!list.length) {
    ul.innerHTML = `<li class="empty">${items.length ? t('No documents match your search') : t('Open markdown files to see them here')}</li>`;
    return;
  }
  const groups = [[t('Local Files'), list.filter((r) => r.kind !== 'url' || r.path.startsWith('/'))], [t('External Files'), list.filter((r) => r.kind === 'url' && !r.path.startsWith('/'))]];
  ul.innerHTML = groups.filter(([, g]) => g.length).map(([title, g]) => `<li class="group">${title}</li>` + g.slice(0, 20).map((r) =>
    `<li><a href="#" data-q="${esc(r.query)}" title="${t('Click to open, Shift+Click for a background tab')}">${icon(r.kind === 'url' && !r.path.startsWith('/') ? 'globe' : 'file', 16)}<span class="txt"><b>${esc(r.name)}</b><span>${esc(r.path)}</span></span><button class="cp" data-copy="${esc(r.path)}" title="${t('Copy URL')}">${icon('copy', 14)}</button><button class="rm" data-key="${esc(r.key)}" title="${t('Remove from list')}">×</button></a></li>`).join('')).join('');
}

document.getElementById('recent').addEventListener('click', async (e) => {
  const cp = e.target.closest('.cp');
  if (cp) {
    e.preventDefault();
    await navigator.clipboard.writeText(cp.dataset.copy);
    cp.innerHTML = icon('check', 14);
    return;
  }
  const rm = e.target.closest('.rm');
  if (rm) {
    e.preventDefault();
    await db.del('recent', rm.dataset.key);
    items = items.filter((i) => i.key !== rm.dataset.key);
    return render();
  }
  const a = e.target.closest('a[data-q]');
  if (!a) return;
  e.preventDefault();
  if (e.shiftKey) chrome.tabs.create({ url: VIEWER + a.dataset.q, active: false });
  else open(a.dataset.q);
});

document.getElementById('q').addEventListener('input', render);
document.getElementById('clear-recent').onclick = async () => {
  if (!confirm(t('Clear all recent documents?'))) return;
  await db.clear('recent');
  items = [];
  render();
};
document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => open(b.dataset.q)));
document.getElementById('settings').onclick = () => chrome.runtime.openOptionsPage();
document.getElementById('enable').onclick = () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });

chrome.extension.isAllowedFileSchemeAccess().then((ok) => (document.getElementById('file-warning').hidden = ok));
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (!tab?.url || !/^(https?|file):/.test(tab.url)) return;
  const b = document.getElementById('render-page');
  b.hidden = false;
  b.onclick = () => { chrome.tabs.update(tab.id, { url: VIEWER + '?file=' + encodeURIComponent(tab.url) }); window.close(); };
});

getSettings().then(async (s) => {
  const dark = s.theme === 'dark' || (s.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = s.theme === 'sepia' ? 'sepia' : dark ? 'dark' : 'light';
  setLanguage(s.language);
  const en = document.getElementById('enabled');
  en.checked = s.enabled;
  en.addEventListener('change', () => setSettings({ enabled: en.checked }));
  hydrateIcons();
  localize();
  items = await getRecent();
  render();
});
