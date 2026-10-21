import { getSettings, setSettings, getLayout, saveLayout, onSettingsChanged } from '../shared/settings.js';
import { addRecent, getRecent, storeHandle, db } from '../shared/db.js';
import { renderMarkdown, enhance, taskPositions, escapeHtml } from './render.js';
import { Outline } from './toc.js';
import { FindBar } from './find.js';
import { Explorer } from './explorer.js';
import { Review } from './review.js';
import { AgentPanel, TerminalPanel } from './agent.js';
import { renderDiff, diffStats } from './diffview.js';
import { sourceFromQuery, sourceFromHandle, NewSource, HandleSource, UrlSource, MD_EXT, VIEWER, PICKER_TYPES } from './sources.js';
import * as native from './native.js';
import { textStats, formatStats, Zoomer, attachZoom } from './extras.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const isMac = navigator.platform.includes('Mac');

const S = {
  settings: null,
  layout: null,
  source: null,
  text: '', // current buffer
  diskText: '', // last known content on disk
  dirty: false,
  mode: 'read',
  editor: null, // { getMarkdown, destroy, ... }
  editorText: null, // buffer text the editor was created from
  external: null, // pending external change text
};

const els = {
  doc: $('#doc'),
  editor: $('#editor'),
  source: $('#source'),
  scroller: $('#scroller'),
  welcome: $('#welcome'),
  banner: $('#banner'),
};

// ---------- UI helpers ----------

function toast(msg, kind = '', ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toasts').append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

function setStatus(text) {
  const el = $('#save-status');
  el.textContent = text;
  el.classList.remove('fade');
  void el.offsetWidth;
  el.classList.add('fade');
}

function modal(html, setup) {
  const dlg = $('#modal');
  const body = dlg.querySelector('.modal-body');
  body.innerHTML = html;
  setup?.(body, dlg);
  dlg.showModal();
  return dlg;
}

function confirmDiscard() {
  return !S.dirty || confirm(`“${S.source?.name}” has unsaved changes. Discard them?`);
}

function applyTheme() {
  const t = S.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = t === 'sepia' ? 'sepia' : dark ? 'dark' : 'light';
  const r = document.documentElement.style;
  r.setProperty('--content-size', S.settings.fontSize + 'px');
  r.setProperty('--content-width', S.settings.contentWidth + 'px');
  document.documentElement.dataset.font = S.settings.fontFamily;
  $('#theme-select').value = t;
}
const isDark = () => document.documentElement.dataset.theme === 'dark';

function updateTitle() {
  const src = S.source;
  $('#doc-name').textContent = src ? src.name : 'MarkCraft';
  // LRM marks keep the leading "/" in place under the rtl (ellipsis-at-start) styling.
  $('#doc-path').textContent = src && src.path !== src.name ? `\u200e${src.path}\u200e` : '';
  $('#doc-path').title = src?.path || '';
  $('#dirty-dot').hidden = !S.dirty;
  $('#save-btn').classList.toggle('attention', S.dirty);
  document.title = (S.dirty ? '• ' : '') + (src ? src.name : 'MarkCraft');
}

function markDirty() {
  S.dirty = S.text !== S.diskText;
  updateTitle();
}

// ---------- rendering ----------

function renderCtx() {
  return {
    settings: S.settings,
    dark: isDark(),
    resolveAsset: (href) => S.source.resolveAsset(href),
    resolveLink: (href) => S.source.resolveLink(href),
    onTaskToggle: toggleTask,
  };
}

async function renderRead({ flashChanges = false } = {}) {
  const before = flashChanges ? [...els.doc.children].map((c) => c.outerHTML) : null;
  const html = renderMarkdown(S.text, S.settings);
  els.doc.innerHTML = html || '<p class="empty-doc">This document is empty.</p>';
  await enhance(els.doc, renderCtx());
  if (before) {
    const seen = new Set(before);
    for (const child of els.doc.children) if (!seen.has(child.outerHTML)) child.classList.add('changed-flash');
    setTimeout(() => els.doc.querySelectorAll('.changed-flash').forEach((c) => c.classList.remove('changed-flash')), 2600);
  }
  applyDirection(els.doc);
  fitTables(els.doc);
  attachZoom(els.doc, zoomer);
  afterContentChange();
  maybeShowImageHint();
}

const zoomer = new Zoomer();

// Per-paragraph direction detection for RTL scripts, or a forced direction.
function applyDirection(root) {
  const dir = S.settings.textDirection;
  root.dir = dir === 'auto' ? '' : dir;
  if (dir !== 'auto') return;
  for (const el of root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dt, dd, figcaption, summary')) el.dir = 'auto';
}

// Narrow tables keep sticky headers; only wide ones become horizontally scrollable.
function fitTables(root) {
  for (const wrap of root.querySelectorAll('.table-wrap')) {
    wrap.classList.toggle('wide', wrap.firstElementChild.scrollWidth > wrap.clientWidth + 1);
  }
}

function updateStats() {
  const bar = $('#statusbar');
  bar.hidden = !S.settings.showStats || !S.source;
  $('#progress').hidden = bar.hidden || S.mode === 'source';
  if (bar.hidden) return;
  $('#stats').textContent = formatStats(textStats(S.text.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~|\[\]()-]/g, ' ')));
  updateProgress();
}

function updateProgress() {
  const sc = els.scroller;
  const max = sc.scrollHeight - sc.clientHeight;
  const pct = max <= 0 ? 100 : Math.round((sc.scrollTop / max) * 100);
  $('#progress > div').style.width = pct + '%';
  $('#progress-pct').textContent = S.mode === 'source' ? '' : pct + '%';
}

function afterContentChange() {
  if (S.mode === 'source') outline.buildFromSource(S.text);
  else outline.build();
  updateStats();
  review.paint();
  find.refresh();
}

function toggleTask(index, checked) {
  const pos = taskPositions(S.text)[index];
  if (pos == null) return;
  S.text = S.text.slice(0, pos) + (checked ? 'x' : ' ') + S.text.slice(pos + 1);
  markDirty();
  if (S.dirty && S.source.writable && S.source.kind === 'handle') save({ quiet: true });
}

function maybeShowImageHint() {
  const broken = els.doc.querySelectorAll('img.broken').length;
  if (!broken || S.source.kind !== 'handle' || S.source.root || S.imageHintShown) return;
  S.imageHintShown = true;
  showBanner(
    `<span>${broken} local image${broken > 1 ? 's' : ''} can’t be shown because MarkCraft only has access to this file.</span>
     <span class="spacer"></span><button class="btn small" data-act="grant-folder">Open containing folder…</button><button class="icon-btn small" data-act="banner-close">✕</button>`,
    'info',
  );
}

// ---------- modes ----------

function scrollAnchor() {
  const sc = els.scroller;
  return { heading: outline.currentHeading(), ratio: sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight) };
}

function restoreScroll(anchor) {
  const sc = els.scroller;
  requestAnimationFrame(() => (sc.scrollTop = anchor.ratio * (sc.scrollHeight - sc.clientHeight)));
}

async function setMode(mode, { force = false } = {}) {
  if (!S.source) return;
  if (mode === S.mode && !force) return;
  const anchor = scrollAnchor();
  if (S.mode === 'source' && mode !== 'source') S.text = els.source.value;
  S.mode = mode;
  $$('#mode-switch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  document.body.dataset.mode = mode;
  els.doc.hidden = mode !== 'read';
  els.editor.hidden = mode !== 'edit';
  els.source.hidden = mode !== 'source';
  find.clear();
  if (mode === 'read') await renderRead();
  if (mode === 'edit') await ensureEditor();
  if (mode === 'source') {
    if (els.source.value !== S.text) els.source.value = S.text;
    afterContentChange();
    els.source.focus({ preventScroll: true });
  }
  restoreScroll(anchor);
}

async function ensureEditor() {
  if (S.editor && S.editorText === S.text) return afterContentChange();
  await destroyEditor();
  els.editor.innerHTML = '<div class="loading-hint">Loading editor…</div>';
  const { createEditor } = await import('./editor.js');
  els.editor.innerHTML = '';
  const startText = S.text;
  S.editorText = startText;
  S.editor = await createEditor({
    root: els.editor,
    markdown: startText,
    resolveAsset: (href) => S.source.resolveAsset(href),
    uploadImage,
    isDark,
    getSettings: () => S.settings,
    onChange: (md, isBaseline) => {
      S.text = isBaseline ? startText : md;
      S.editorText = S.text;
      markDirty();
      scheduleOutline();
    },
  });
  afterContentChange();
}

async function destroyEditor() {
  if (!S.editor) return;
  const ed = S.editor;
  S.editor = null;
  S.editorText = null;
  try { await ed.destroy(); } catch {}
  els.editor.innerHTML = '';
}

let outlineTimer;
function scheduleOutline() {
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(() => afterContentChange(), 300);
}

async function uploadImage(file) {
  const src = S.source;
  if (src?.kind === 'handle' && src.root) {
    try {
      const dirParts = src.relPath.split('/').slice(0, -1);
      let dir = src.root;
      for (const p of dirParts) dir = await dir.getDirectoryHandle(p);
      const assets = await dir.getDirectoryHandle('assets', { create: true });
      const name = `${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
      const fh = await assets.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(file);
      await w.close();
      return `assets/${name}`;
    } catch (e) {
      console.warn('Image save failed, embedding instead', e);
    }
  }
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

// ---------- loading documents ----------

async function loadSource(src, { push = true, replace = false, initialText = null, keepMode = false } = {}) {
  await src.init();
  if (src.kind === 'handle' && (await src.needsPermission())) {
    const ok = await askPermission(src);
    if (!ok) return;
  }
  await src.pendingResolve?.();
  let text;
  try {
    text = initialText ?? (await src.read());
  } catch (e) {
    return showLoadError(src, e);
  }
  stopWatch();
  await destroyEditor();
  S.source?.assets?.clear();
  S.source = src;
  S.text = text;
  S.diskText = src.kind === 'new' ? '' : text;
  S.external = null;
  S.imageHintShown = false;
  hideBanner();
  markDirty();
  document.body.classList.remove('loading', 'welcome');
  els.welcome.hidden = true;
  const url = VIEWER + src.query + (push || replace ? '' : location.hash);
  if (push && location.href !== url) history.pushState(null, '', url);
  else if (replace) history.replaceState(null, '', url);
  updateTitle();
  if (src.key) addRecent({ key: src.key, name: src.name, path: src.path, query: src.query, kind: src.kind });
  review.load(src.key);
  setupExplorerFor(src);
  const mode = keepMode ? S.mode : src.kind === 'new' ? 'edit' : S.settings.defaultMode;
  S.mode = null;
  await setMode(mode);
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    target?.scrollIntoView();
  } else els.scroller.scrollTop = 0;
  startWatch();
}

function askPermission(src) {
  return new Promise((resolve) => {
    document.body.classList.remove('loading');
    showWelcome(
      `<div class="perm-card"><h2>Allow access to “${escapeHtml(src.root ? src.root.name : src.name)}”</h2>
      <p>Chrome needs you to confirm access again after a restart.</p>
      <button class="btn primary" id="perm-btn">Allow access</button></div>`,
    );
    $('#perm-btn').onclick = async () => {
      const ok = await src.requestPermission().catch(() => false);
      if (ok) resolve(true);
      else toast('Access was not granted', 'error');
    };
  });
}

function showLoadError(src, e) {
  document.body.classList.remove('loading');
  const fileBlocked = src.kind === 'url' && src.isFile;
  showWelcome(`<div class="perm-card"><h2>Couldn’t open ${escapeHtml(src.name)}</h2>
    <p class="error-text">${escapeHtml(e.message || String(e))}</p>
    ${fileBlocked ? `<p>To read local files, turn on <b>Allow access to file URLs</b> for MarkCraft.</p><button class="btn primary" id="ext-settings">Open extension settings</button>` : ''}
    <p><button class="btn" id="retry-btn">Try again</button></p></div>`);
  $('#retry-btn').onclick = () => loadSource(src, { push: false });
  $('#ext-settings')?.addEventListener('click', () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }));
}

async function openFromLocation() {
  const params = new URLSearchParams(location.search);
  let src = null;
  try {
    src = await sourceFromQuery(params);
  } catch (e) {
    document.body.classList.remove('loading');
    return showWelcomeScreen(e.message);
  }
  if (!src) return showWelcomeScreen();
  let initialText = null;
  if (params.get('pending')) {
    initialText = (await chrome.storage.session.get('pendingText')).pendingText || '';
    chrome.storage.session.remove('pendingText');
  }
  await loadSource(src, { push: false, initialText });
}

async function navigate(href, newTab = false) {
  if (newTab) return window.open(href, '_blank');
  if (!confirmDiscard()) return;
  const url = new URL(href);
  try {
    const src = await sourceFromQuery(url.searchParams);
    if (!src) return;
    history.pushState(null, '', href);
    await loadSource(src, { push: false });
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---------- welcome ----------

function showWelcome(html) {
  document.body.classList.add('welcome');
  els.welcome.hidden = false;
  els.doc.hidden = els.editor.hidden = els.source.hidden = true;
  els.welcome.innerHTML = html;
}

async function showWelcomeScreen(error) {
  document.body.classList.remove('loading');
  S.source = null;
  updateTitle();
  const recent = await getRecent();
  const fileAccess = await chrome.extension.isAllowedFileSchemeAccess();
  showWelcome(`
    <div class="welcome-card">
      <img src="icons/128.png" alt="" width="72" height="72">
      <h1>MarkCraft</h1>
      <p class="tagline">Read, edit and review Markdown — right in Chrome.</p>
      ${error ? `<p class="error-text">${escapeHtml(error)}</p>` : ''}
      <div class="welcome-actions">
        <button class="btn primary" data-act="open">Open file…</button>
        <button class="btn" data-act="open-folder">Open folder…</button>
        <button class="btn" data-act="new">New document</button>
      </div>
      <p class="hint">or drop a .md file or folder anywhere on this page · ${isMac ? '⌘' : 'Ctrl+'}O to open</p>
      ${fileAccess ? '' : `<div class="notice">To open <code>file://</code> Markdown links directly, enable <b>Allow access to file URLs</b>. <button class="link-btn" id="ext-settings">Open settings</button></div>`}
      ${recent.length ? `<h3>Recent</h3><ul class="recent">${recent.slice(0, 12).map((r) => `<li><a href="${VIEWER}${r.query}" data-internal="1"><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.path)}</span></a></li>`).join('')}</ul>` : ''}
    </div>`);
  $('#ext-settings')?.addEventListener('click', () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }));
  outline.build();
  if (!explorer.root) explorer.setRoot(null);
}

// ---------- explorer ----------

let explorerRootKey = null;
async function setupExplorerFor(src) {
  let root = null;
  if (src.kind === 'url' && src.isFile) root = { type: 'url', url: src.dirUrl };
  if (src.kind === 'handle' && src.root) root = { type: 'handle', handle: src.root, id: src.rootId };
  const key = root ? root.url || root.id : null;
  if (root && explorer.root && (explorer.root.type === 'url' && root.type === 'url' ? src.url.startsWith(explorer.root.url) : explorer.root.id === root.id)) {
    explorer.markCurrent(src.key);
    return;
  }
  if (key === explorerRootKey && root) return explorer.markCurrent(src.key);
  explorerRootKey = key;
  if (root) await explorer.setRoot(root, src.key);
  else if (!explorer.root) explorer.setRoot(null);
}

async function openFolder() {
  let dir;
  try {
    dir = await showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message, 'error');
    return;
  }
  await useFolder(dir);
}

async function useFolder(dir) {
  const id = await storeHandle(dir);
  // If the current document lives inside this folder, re-open it relative to the folder
  // so images and links resolve.
  if (S.source?.kind === 'handle' && !S.source.root) {
    const rel = await dir.resolve(S.source.handle).catch(() => null);
    if (rel) {
      const src = new HandleSource(S.source.handle, { root: dir, rootId: id, relPath: rel.join('/') });
      await loadSource(src, { initialText: S.text, keepMode: true });
      S.diskText = await src.read().catch(() => S.diskText);
      markDirty();
      showSide('files');
      return;
    }
  }
  explorerRootKey = id;
  await explorer.setRoot({ type: 'handle', handle: dir, id }, S.source?.key);
  showSide('files');
  setSidebar(true);
  if (!S.source || S.source.kind === 'new') {
    for (const name of ['README.md', 'readme.md', 'index.md']) {
      const fh = await dir.getFileHandle(name).catch(() => null);
      if (fh) return navigate(VIEWER + `?root=${id}&path=${encodeURIComponent(name)}`);
    }
  }
}

// ---------- open / save ----------

async function openFile() {
  let handle;
  try {
    [handle] = await showOpenFilePicker({ types: PICKER_TYPES, excludeAcceptAllOption: false });
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message, 'error');
    return;
  }
  if (!confirmDiscard()) return;
  await loadSource(await sourceFromHandle(handle));
}

async function save({ as = false, quiet = false } = {}) {
  if (!S.source) return;
  if (S.mode === 'source') S.text = els.source.value;
  const text = S.text;
  try {
    let next;
    if (as) {
      const handle = await showSaveFilePicker({ suggestedName: S.source.name, types: PICKER_TYPES });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      next = await sourceFromHandle(handle);
    } else {
      next = await S.source.write(text);
    }
    S.diskText = text;
    if (next) {
      const mode = S.mode;
      await loadSource(next, { initialText: text, keepMode: true });
      S.mode = mode;
    }
    markDirty();
    setStatus(`Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    if (!quiet) toast(`Saved “${S.source.name}”`, 'ok', 1600);
  } catch (e) {
    if (e.name === 'AbortError') return;
    toast('Save failed: ' + e.message, 'error', 5000);
  }
}

// ---------- change detection ----------

let watchTimer = null;
let watchBusy = false;
function startWatch() {
  stopWatch();
  if (!S.source || S.source.kind === 'new') return;
  const interval = S.source.pollInterval || S.settings.pollInterval;
  watchTimer = setInterval(checkDisk, interval);
}
function stopWatch() {
  clearInterval(watchTimer);
  watchTimer = null;
}

async function checkDisk() {
  if (watchBusy || !S.source) return;
  if (document.hidden && S.source.pollInterval) return; // remote: only while visible
  watchBusy = true;
  const src = S.source;
  try {
    const res = await src.check();
    if (src !== S.source || !res) return;
    if (res.text === S.diskText || res.text === S.external) return;
    onExternalChange(res.text);
  } catch {
    // File temporarily unavailable (e.g. being rewritten); try again next tick.
  } finally {
    watchBusy = false;
  }
}

function onExternalChange(text) {
  if (!S.dirty && S.settings.autoAccept) {
    acceptExternal(text);
    toast('Reloaded — file changed on disk', '', 1800);
    return;
  }
  S.external = text;
  const { added, removed } = diffStats(S.diskText, text);
  showBanner(
    `<span class="banner-icon">⟳</span><span><b>${escapeHtml(S.source.name)}</b> changed on disk <span class="stat add">+${added}</span> <span class="stat del">−${removed}</span>${S.dirty ? ' — <b>you have unsaved edits</b>' : ''}</span>
     <span class="spacer"></span>
     <button class="btn small" data-act="ext-diff">View changes</button>
     <button class="btn small" data-act="ext-dismiss" title="Keep the version in the editor">Dismiss</button>
     <button class="btn small primary" data-act="ext-accept">Accept</button>`,
    'change',
  );
}

async function acceptExternal(text = S.external) {
  if (text == null) return;
  S.external = null;
  hideBanner();
  S.diskText = text;
  S.text = text;
  markDirty();
  const anchor = scrollAnchor();
  if (S.mode === 'read') await renderRead({ flashChanges: true });
  else if (S.mode === 'edit') await ensureEditor();
  else { els.source.value = text; afterContentChange(); }
  restoreScroll(anchor);
}

function dismissExternal() {
  if (S.external == null) return;
  S.diskText = S.external; // disk now differs from the buffer, so the buffer is dirty
  S.external = null;
  hideBanner();
  markDirty();
}

function showExternalDiff() {
  if (S.external == null) return;
  const base = S.dirty ? S.text : S.diskText;
  modal(`<h2>Changes on disk</h2><p class="hint">${S.dirty ? 'Compared with your unsaved buffer.' : 'Compared with the version you are viewing.'}</p>
    <div class="diff big">${renderDiff(base, S.external)}</div>
    <div class="row"><span class="spacer"></span><button class="btn" value="dismiss">Dismiss</button><button class="btn primary" value="accept">Accept</button></div>`,
  (body, dlg) => {
    dlg.onclose = () => {
      if (dlg.returnValue === 'accept') acceptExternal();
      if (dlg.returnValue === 'dismiss') dismissExternal();
      dlg.onclose = null;
    };
  });
}

function showBanner(html, kind) {
  els.banner.className = 'banner ' + kind;
  els.banner.innerHTML = html;
  els.banner.hidden = false;
}
function hideBanner() {
  els.banner.hidden = true;
  els.banner.innerHTML = '';
}

// ---------- export ----------

// Rendered HTML for exports. `portable` swaps local blob: images back to their
// Markdown paths (for standalone HTML); otherwise blob URLs are kept so the
// images can still be read (Word export).
async function readModeHtml({ portable = false } = {}) {
  let root = els.doc;
  if (S.mode !== 'read') {
    root = document.createElement('div');
    root.innerHTML = renderMarkdown(S.text, S.settings);
    root.style.cssText = 'position:absolute;left:-99999px;width:800px';
    document.body.append(root);
    await enhance(root, renderCtx());
    root.remove();
  }
  const clone = root.cloneNode(true);
  clone.querySelectorAll('.code-tools,.line-numbers,.diagram-zoom').forEach((n) => n.remove());
  clone.querySelectorAll('.changed-flash,.flash,.zoomable').forEach((n) => n.classList.remove('changed-flash', 'flash', 'zoomable'));
  let html = clone.innerHTML;
  if (portable) {
    // String-level swap: assigning a relative src to an element would start loading it.
    html = html.replace(/<img([^>]*?) src="blob:[^"]*"([^>]*?) data-src="([^"]*)"/g, '<img$1 src="$3"$2').replace(/<img([^>]*?) data-src="([^"]*)"([^>]*?) src="blob:[^"]*"/g, '<img$1 src="$2"$3');
  }
  return html;
}

async function exportHtml() {
  const body = await readModeHtml({ portable: true });
  const css = await (await fetch('content-style.css')).text();
  const title = S.source.name.replace(MD_EXT, '');
  const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">
<style>
${css}
body{margin:0;background:var(--bg)}
.markdown-body{max-width:var(--content-width);margin:0 auto;padding:48px 32px}
</style>
</head>
<body><article class="markdown-body">${body}</article></body>
</html>`;
  download(new Blob([html], { type: 'text/html' }), title + '.html');
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function copyRich() {
  const html = await readModeHtml();
  await navigator.clipboard.write([
    new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([S.text], { type: 'text/plain' }) }),
  ]);
  toast('Copied as rich text');
}

async function exportWord() {
  toast('Building Word document…', '', 1500);
  const html = await readModeHtml();
  const tmp = document.createElement('div');
  tmp.className = 'markdown-body';
  tmp.style.cssText = 'position:absolute;left:-99999px;width:800px';
  tmp.innerHTML = html;
  document.body.append(tmp);
  try {
    const [{ exportDocx }, { mermaidPlain }] = await Promise.all([import('./docx.js'), import('./diagrams.js')]);
    const title = S.source.name.replace(MD_EXT, '');
    download(await exportDocx(tmp, { title, mermaidPlain }), title + '.docx');
  } catch (e) {
    toast('Word export failed: ' + e.message, 'error', 5000);
  } finally {
    tmp.remove();
  }
}

async function startPresentation() {
  if (S.mode === 'source') S.text = els.source.value;
  const { present } = await import('./present.js');
  if (!present(S.text, renderCtx())) toast('Nothing to present');
}

async function showMindMap() {
  if (S.mode === 'source') S.text = els.source.value;
  const { openMindMap } = await import('./mindmap.js');
  openMindMap(S.text, S.source.name).catch((e) => toast('Mind map failed: ' + e.message, 'error'));
}

async function printDoc() {
  if (S.mode !== 'read') await setMode('read');
  setTimeout(() => window.print(), 50);
}

// ---------- review & hand-off ----------

function startComment() {
  if (S.mode === 'source') return toast('Switch to Read or Edit mode to comment on text');
  hideFab();
  if (!review.startFromSelection()) toast('Select some text in the document first');
}

function handoff() {
  if (!S.source) return;
  if (!review.open.length) {
    setPanel(true, 'comments');
    return toast('Add review comments first (select text, then ⌘⇧R)');
  }
  const prompt = review.buildPrompt(S.source.path);
  modal(`<h2>Hand off review</h2><p class="hint">Edit the prompt, then copy it to your agent or run it with the built-in agent.</p>
    <textarea id="handoff-text" rows="14" spellcheck="false">${escapeHtml(prompt)}</textarea>
    <label class="check"><input type="checkbox" id="handoff-resolve" checked> Mark comments as resolved</label>
    <div class="row"><span class="spacer"></span><button class="btn" value="cancel">Cancel</button><button class="btn" value="agent">Send to Agent</button><button class="btn primary" value="copy">Copy prompt</button></div>`,
  (body, dlg) => {
    const ta = body.querySelector('#handoff-text');
    setTimeout(() => ta.focus(), 0);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); dlg.close('copy'); }
    });
    dlg.onclose = async () => {
      dlg.onclose = null;
      const v = dlg.returnValue;
      if (v !== 'copy' && v !== 'agent') return;
      const text = ta.value;
      const resolve = body.querySelector('#handoff-resolve').checked;
      if (v === 'copy') {
        await navigator.clipboard.writeText(text);
        toast('Prompt copied — paste it into your agent');
      } else {
        setPanel(true, 'agent');
        agent.setPrompt(text);
      }
      if (resolve) { review.items.forEach((i) => (i.resolved = true)); review.persist(); review.paint(); }
    };
  });
}

// Floating "Comment" button next to a text selection.
const fab = $('#selection-fab');
function hideFab() { fab.hidden = true; }
function updateFab() {
  const sel = window.getSelection();
  const root = activeRoot();
  if (!sel || sel.isCollapsed || !root || !root.contains(sel.anchorNode) || !String(sel).trim() || !$('#composer').hidden) return hideFab();
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  fab.hidden = false;
  fab.style.left = Math.min(window.innerWidth - 120, rect.right + 6) + 'px';
  fab.style.top = Math.max(56, rect.top - 36) + 'px';
}

// ---------- layout ----------

function activeRoot() {
  if (S.mode === 'read') return els.doc;
  if (S.mode === 'edit') return els.editor.querySelector('.ProseMirror') || els.editor;
  return null;
}

function setSidebar(open) {
  S.layout.sidebarOpen = open;
  document.body.classList.toggle('sidebar-closed', !open);
  saveLayout({ sidebarOpen: open });
}

function showSide(tab) {
  S.layout.sidebarTab = tab;
  $$('[data-side]').forEach((b) => b.classList.toggle('active', b.dataset.side === tab));
  $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== tab));
  saveLayout({ sidebarTab: tab });
}

function setPanel(open, tab) {
  S.layout.panelOpen = open;
  $('#panel').hidden = !open;
  if (tab) {
    S.layout.panelTab = tab;
    $$('[data-ptab]').forEach((b) => b.classList.toggle('active', b.dataset.ptab === tab));
    $$('[data-ppane]').forEach((p) => (p.hidden = p.dataset.ppane !== tab));
    if (tab === 'agent') agent.refresh();
    if (tab === 'terminal') { terminal.refresh(); setTimeout(() => $('#term-input').focus(), 0); }
  }
  saveLayout({ panelOpen: open, panelTab: S.layout.panelTab });
}

function setupResizers() {
  const root = document.documentElement.style;
  root.setProperty('--sidebar-width', S.layout.sidebarWidth + 'px');
  root.setProperty('--panel-width', S.layout.panelWidth + 'px');
  for (const handle of $$('[data-resize]')) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const which = handle.dataset.resize;
      const startX = e.clientX;
      const start = which === 'sidebar' ? S.layout.sidebarWidth : S.layout.panelWidth;
      document.body.classList.add('resizing');
      const move = (ev) => {
        const dx = ev.clientX - startX;
        const w = Math.round(Math.max(180, Math.min(window.innerWidth * 0.6, which === 'sidebar' ? start + dx : start - dx)));
        if (which === 'sidebar') { S.layout.sidebarWidth = w; root.setProperty('--sidebar-width', w + 'px'); }
        else { S.layout.panelWidth = w; root.setProperty('--panel-width', w + 'px'); }
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        document.body.classList.remove('resizing');
        saveLayout({ sidebarWidth: S.layout.sidebarWidth, panelWidth: S.layout.panelWidth });
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up, { once: true });
    });
    handle.addEventListener('dblclick', () => {
      const which = handle.dataset.resize;
      if (which === 'sidebar') { S.layout.sidebarWidth = 270; root.setProperty('--sidebar-width', '270px'); }
      else { S.layout.panelWidth = 360; root.setProperty('--panel-width', '360px'); }
      saveLayout({ sidebarWidth: S.layout.sidebarWidth, panelWidth: S.layout.panelWidth });
    });
  }
}

// ---------- drag & drop ----------

function setupDrop() {
  let depth = 0;
  const overlay = $('#drop-overlay');
  const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; overlay.hidden = false; } });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; overlay.hidden = true; } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    // Let the WYSIWYG editor take image drops.
    if (S.mode === 'edit' && e.target.closest?.('#editor') && [...e.dataTransfer.items].every((i) => i.type.startsWith('image/'))) {
      depth = 0; overlay.hidden = true;
      return;
    }
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    const item = [...e.dataTransfer.items].find((i) => i.kind === 'file');
    const handle = await item?.getAsFileSystemHandle?.();
    if (!handle) return;
    if (handle.kind === 'directory') {
      if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
      return useFolder(handle);
    }
    if (!MD_EXT.test(handle.name) && !/\.txt$/i.test(handle.name)) return toast('Not a Markdown file: ' + handle.name, 'error');
    if (!confirmDiscard()) return;
    await loadSource(await sourceFromHandle(handle));
  });
}

// ---------- keyboard ----------

function shortcutsHelp() {
  const m = isMac ? '⌘' : 'Ctrl+';
  const s = isMac ? '⇧' : 'Shift+';
  const rows = [
    [`${m}O`, 'Open file'], [`${m}S`, 'Save'], [`${s}${m}S`, 'Save as'], [`${m}P`, 'Print / PDF'],
    [`${m}E`, 'Toggle Read / Edit'], [`${s}${m}E`, 'Source mode'], [`${m}F`, 'Find'], [`${m}G / ${s}${m}G`, 'Next / previous match'],
    [`${m}\\`, 'Toggle sidebar'], [`${s}${m}L`, 'Toggle review / agent panel'], [`${s}${m}R`, 'Comment on selection'], [`${s}${m}Enter`, 'Hand off review prompt'],
    [`⌥${m}P`, 'Present as slides (←/→, F fullscreen, N notes, T theme, A auto-play)'], [`⌥${m}M`, 'Mind map'],
    [`${m}T / ${m}N / ${m}W`, 'New tab / window / close (browser)'], ['?', 'This help'],
  ];
  modal(`<h2>Keyboard shortcuts</h2><table class="keys">${rows.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table>
    <div class="row"><span class="spacer"></span><button class="btn primary" value="ok">Close</button></div>`);
}

function onKey(e) {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const k = e.key.toLowerCase();
  const inField = e.target.matches?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]') || e.target.closest?.('.ProseMirror');
  if (mod && !e.altKey) {
    const handlers = {
      s: () => save({ as: e.shiftKey }),
      o: () => openFile(),
      f: () => !e.shiftKey && S.source && find.open(),
      g: () => S.source && (find.isOpen ? find.step(e.shiftKey ? -1 : 1) : find.open()),
      e: () => S.source && setMode(e.shiftKey ? (S.mode === 'source' ? 'read' : 'source') : S.mode === 'read' ? 'edit' : 'read'),
      '\\': () => setSidebar(!S.layout.sidebarOpen),
      p: () => S.source && printDoc(),
      l: () => e.shiftKey && setPanel($('#panel').hidden, S.layout.panelTab),
      r: () => e.shiftKey && S.source && startComment(),
      enter: () => e.shiftKey && handoff(),
    };
    const h = handlers[k];
    if (h && (k !== 'l' && k !== 'r' && k !== 'enter' ? true : e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      h();
      return;
    }
  }
  if (mod && e.altKey && S.source) {
    if (e.code === 'KeyP') { e.preventDefault(); return startPresentation(); }
    if (e.code === 'KeyM') { e.preventDefault(); return showMindMap(); }
  }
  if (e.key === 'Escape') {
    if (find.isOpen) find.close();
    hideFab();
  }
  if (e.key === '?' && !inField && !mod) shortcutsHelp();
}

// ---------- wiring ----------

const outline = new Outline({ el: $('#toc'), filter: $('#toc-filter'), getRoot: () => activeRoot(), getScroller: () => els.scroller });
outline.buildFromSource = function buildFromSource(text) {
  // Source mode: headings come from the Markdown text and jump to their line.
  const lines = text.split('\n');
  let fence = false;
  const heads = [];
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) heads.push({ level: m[1].length, text: m[2], line: i });
  });
  const min = Math.min(...heads.map((h) => h.level));
  this.sig = null;
  this.heads = null;
  this.el.innerHTML = heads.length
    ? heads.map((h, i) => `<div class="toc-item" data-line="${h.line}" data-i="${i}" style="--lvl:${h.level - min}"><span class="toc-twist leaf"></span><span class="toc-text">${escapeHtml(h.text)}</span></div>`).join('')
    : '<div class="empty-hint">No headings</div>';
};
$('#toc').addEventListener('click', (e) => {
  const item = e.target.closest('.toc-item[data-line]');
  if (!item || S.mode !== 'source') return;
  e.stopPropagation();
  const line = +item.dataset.line;
  const ta = els.source;
  const pos = ta.value.split('\n').slice(0, line).join('\n').length + (line ? 1 : 0);
  ta.focus();
  ta.setSelectionRange(pos, pos);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
  ta.scrollTop = Math.max(0, line * lh - 40);
}, true);

const find = new FindBar({
  el: $('#findbar'),
  getRoot: () => activeRoot(),
  getScroller: () => els.scroller,
  getTextarea: () => (S.mode === 'source' ? els.source : null),
});

const explorer = new Explorer({
  el: $('#explorer'),
  titleEl: $('#fx-title'),
  upBtn: $('#fx-up'),
  onOpen: (href, newTab) => navigate(href, newTab),
});

const review = new Review({
  listEl: $('#comments'),
  countEl: $('#comment-count'),
  composer: $('#composer'),
  getRoot: () => activeRoot(),
  getScroller: () => els.scroller,
});

const agent = new AgentPanel({
  el: $('#agent-pane'),
  getDoc: () => ({ text: S.mode === 'source' ? els.source.value : S.text, name: S.source?.name || 'Untitled.md', path: S.source?.path || 'Untitled.md', dirPath: S.source?.dirPath }),
  onApply: async (text, andSave) => {
    S.text = text;
    markDirty();
    const anchor = scrollAnchor();
    if (S.mode === 'read') await renderRead({ flashChanges: true });
    else if (S.mode === 'edit') await ensureEditor();
    else { els.source.value = text; afterContentChange(); }
    restoreScroll(anchor);
    if (andSave) await save();
    else toast('Changes applied — not saved yet');
  },
  getSettings: () => S.settings,
  saveSettings: (patch) => setSettings(patch),
  toast,
});

const terminal = new TerminalPanel({ el: $('#term-pane'), getCwd: () => S.source?.dirPath });

const actions = {
  'toggle-sidebar': () => setSidebar(!S.layout.sidebarOpen),
  'toggle-panel': () => setPanel($('#panel').hidden, S.layout.panelTab),
  find: () => S.source && find.open(),
  comment: () => startComment(),
  save: () => save(),
  'save-as': () => save({ as: true }),
  open: () => openFile(),
  'open-folder': () => openFolder(),
  new: () => { if (confirmDiscard()) loadSource(new NewSource()); },
  reload: async () => {
    if (!S.source || !confirmDiscard()) return;
    const t = await S.source.read();
    S.dirty = false;
    await acceptExternal(t);
  },
  'export-html': () => S.source && exportHtml(),
  'export-docx': () => S.source && exportWord(),
  present: () => S.source && startPresentation(),
  mindmap: () => S.source && showMindMap(),
  'export-md': () => S.source && download(new Blob([S.text], { type: 'text/markdown' }), S.source.name),
  print: () => S.source && printDoc(),
  'copy-html': () => S.source && copyRich(),
  'copy-md': async () => { await navigator.clipboard.writeText(S.text); toast('Markdown copied'); },
  'view-raw': () => {
    if (S.source?.kind === 'url') window.open(S.source.url + '#raw', '_blank');
    else if (S.source) window.open(URL.createObjectURL(new Blob([S.text], { type: 'text/plain;charset=utf-8' })), '_blank');
  },
  shortcuts: () => shortcutsHelp(),
  settings: () => chrome.runtime.openOptionsPage(),
  handoff: () => handoff(),
  'clear-comments': () => { if (review.items.length && confirm('Delete all review comments for this document?')) review.clearAll(); },
  'ext-accept': () => acceptExternal(),
  'ext-dismiss': () => dismissExternal(),
  'ext-diff': () => showExternalDiff(),
  'banner-close': () => hideBanner(),
  'grant-folder': () => { hideBanner(); openFolder(); },
  menu: () => { $('#main-menu').hidden = !$('#main-menu').hidden; },
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!e.target.closest('.menu-wrap')) $('#main-menu').hidden = true;
  if (btn && actions[btn.dataset.act] && !btn.closest('#findbar, #composer, #agent-pane, #term-pane, .comment-card')) {
    if (btn.closest('#main-menu') && btn.dataset.act !== 'menu') $('#main-menu').hidden = true;
    actions[btn.dataset.act]();
    return;
  }
  const a = e.target.closest('a[data-internal]');
  if (a && !e.defaultPrevented) {
    e.preventDefault();
    navigate(a.href, e.metaKey || e.ctrlKey || e.button === 1);
    return;
  }
  const anchor = e.target.closest('#doc a[href^="#"]');
  if (anchor) {
    e.preventDefault();
    const id = decodeURIComponent(anchor.getAttribute('href').slice(1));
    const target = document.getElementById(id) || document.getElementById('user-content-' + id);
    if (target) { history.replaceState(null, '', '#' + id); els.scroller.scrollTo({ top: els.scroller.scrollTop + target.getBoundingClientRect().top - els.scroller.getBoundingClientRect().top - 12, behavior: 'smooth' }); }
  }
  if (e.target.closest('#doc, #editor') && window.getSelection()?.isCollapsed) review.hitTest(e.clientX, e.clientY);
});

$$('#mode-switch button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$$('[data-side]').forEach((b) => b.addEventListener('click', () => showSide(b.dataset.side)));
$$('[data-ptab]').forEach((b) => b.addEventListener('click', () => setPanel(true, b.dataset.ptab)));
fab.addEventListener('mousedown', (e) => e.preventDefault());
fab.addEventListener('click', () => startComment());
document.addEventListener('selectionchange', () => {
  clearTimeout(updateFab.t);
  updateFab.t = setTimeout(updateFab, 150);
});
els.scroller.addEventListener('scroll', () => { hideFab(); updateProgress(); }, { passive: true });
window.addEventListener('resize', () => { if (S.mode === 'read') fitTables(els.doc); });

let sourceTimer;
els.source.addEventListener('input', () => {
  S.text = els.source.value;
  markDirty();
  clearTimeout(sourceTimer);
  sourceTimer = setTimeout(afterContentChange, 400);
});
els.source.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  document.execCommand('insertText', false, '  ');
});

$('#theme-select').addEventListener('change', async (e) => {
  S.settings = await setSettings({ theme: e.target.value });
});

window.addEventListener('keydown', onKey, true);
window.addEventListener('beforeunload', (e) => {
  if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('popstate', () => {
  if (!confirmDiscard()) return history.pushState(null, '', VIEWER + (S.source?.query || ''));
  openFromLocation();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDisk(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (S.settings.theme !== 'auto') return;
  applyTheme();
  if (S.mode === 'read' && S.source) renderRead();
});

onSettingsChanged(async (settings) => {
  const prev = S.settings;
  S.settings = settings;
  applyTheme();
  const rerender = ['theme', 'math', 'mermaid', 'codeLineNumbers', 'textDirection', 'plantumlServer'].some((k) => prev[k] !== settings[k]);
  if (rerender && S.mode === 'read' && S.source) renderRead();
  if (prev.pollInterval !== settings.pollInterval) startWatch();
  updateStats();
});

async function init() {
  [S.settings, S.layout] = await Promise.all([getSettings(), getLayout()]);
  applyTheme();
  setupResizers();
  setupDrop();
  document.body.classList.toggle('sidebar-closed', !S.layout.sidebarOpen);
  showSide(S.layout.sidebarTab);
  if (S.layout.panelOpen) setPanel(true, S.layout.panelTab);
  else $$('[data-ptab]').forEach((b) => b.classList.toggle('active', b.dataset.ptab === S.layout.panelTab));
  $$('[data-ppane]').forEach((p) => (p.hidden = p.dataset.ppane !== S.layout.panelTab));
  await openFromLocation();
}

init();

// Exposed for automated tests.
window.__markcraft = { S, setMode, save, acceptExternal, review, native, db, UrlSource };
