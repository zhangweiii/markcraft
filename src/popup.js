import { getRecent } from './shared/db.js';

const VIEWER = chrome.runtime.getURL('viewer.html');
const open = (q) => { chrome.tabs.create({ url: VIEWER + q }); window.close(); };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => open(b.dataset.q)));
document.getElementById('settings').onclick = () => chrome.runtime.openOptionsPage();
document.getElementById('enable').onclick = () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });

chrome.extension.isAllowedFileSchemeAccess().then((ok) => (document.getElementById('file-warning').hidden = ok));

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (!tab?.url || !/^(https?|file):/.test(tab.url)) return;
  document.getElementById('page-action').hidden = false;
  document.getElementById('render-page').onclick = () => {
    chrome.tabs.update(tab.id, { url: VIEWER + '?file=' + encodeURIComponent(tab.url) });
    window.close();
  };
});

getRecent().then((items) => {
  const ul = document.getElementById('recent');
  ul.innerHTML = items.length
    ? items.slice(0, 15).map((r) => `<li><a href="#" data-q="${esc(r.query)}"><b>${esc(r.name)}</b><span>${esc(r.path)}</span></a></li>`).join('')
    : '<li class="empty">No recent documents</li>';
  ul.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); open(a.dataset.q); }));
});
