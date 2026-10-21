// Runs at document_start on every page; redirects raw Markdown documents to the viewer.
const MD_EXT = /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdtxt|mdtext|mdx|rmd|qmd)$/i;

(function detect() {
  if (window.top !== window) return;
  if (location.hash === '#raw' || /[?&]markcraft=raw\b/.test(location.search)) return;
  const type = document.contentType || '';
  const isMarkdownType = /^text\/(x-)?markdown$/i.test(type);
  const isPlain = /^text\/plain$/i.test(type) || type === 'application/octet-stream';
  let path = location.pathname;
  try { path = decodeURIComponent(path); } catch {}
  if (!isMarkdownType && !(isPlain && MD_EXT.test(path))) return;

  const go = () => location.replace(chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(location.href));
  if (location.protocol === 'file:') return go();
  chrome.storage.sync.get('settings', ({ settings }) => {
    if (!settings || settings.interceptHttp !== false) go();
  });
})();
