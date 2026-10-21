// Runs at document_start on every page; redirects raw Markdown documents to the viewer.
const MD_EXT = /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdtxt|mdtext|mdx|rmd|qmd)$/i;
const TXT_EXT = /\.txt$/i;

(function detect() {
  if (window.top !== window) return;
  if (location.hash === '#raw' || /[?&]markcraft=raw\b/.test(location.search)) return;
  const type = document.contentType || '';
  const isMarkdownType = /^text\/(x-)?markdown$/i.test(type);
  const isPlain = /^text\/plain$/i.test(type) || type === 'application/octet-stream';
  let path = location.pathname;
  try { path = decodeURIComponent(path); } catch {}
  const isMd = isMarkdownType || (isPlain && MD_EXT.test(path));
  const isTxt = !isMd && isPlain && TXT_EXT.test(path);
  if (!isMd && !isTxt) return;

  const go = () => location.replace(chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(location.href));
  chrome.storage.sync.get('settings', ({ settings = {} }) => {
    if (location.protocol !== 'file:' && settings.interceptHttp === false) return;
    if (isTxt && settings.renderTxt === false) return;
    go();
  });
})();
