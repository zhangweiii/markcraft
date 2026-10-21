import { getSettings, setSettings, getLayout, saveLayout, onSettingsChanged, SHORTCUTS } from '../shared/settings.js';
import { icon, hydrateIcons } from '../shared/icons.js';
import { mountSettings, comboFromEvent, comboLabel } from '../shared/settings-ui.js';
import { addRecent, getRecent, storeHandle, db } from '../shared/db.js';
import { renderMarkdown, enhance, taskPositions, escapeHtml, FRONT_MATTER as FRONT_MATTER_RE } from './render.js';
import { Outline } from './toc.js';
import { FindBar } from './find.js';
import { Explorer } from './explorer.js';
import { Review } from './review.js';
import { AgentPanel, TerminalPanel } from './agent.js';
import { renderDiff, diffStats } from './diffview.js';
import { sourceFromQuery, sourceFromHandle, NewSource, HandleSource, UrlSource, MD_EXT, VIEWER, PICKER_TYPES } from './sources.js';
import * as native from './native.js';
import { textStats, formatStats, Zoomer, attachZoom } from './extras.js';
import { setupFolderTools } from './folders.js';
import { t, setLanguage, localize } from '../shared/i18n.js';

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
  return !S.dirty || confirm(t('“{name}” has unsaved changes. Discard them?', { name: S.source?.name }));
}

function applyTheme() {
  const t = S.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = t === 'sepia' ? 'sepia' : dark ? 'dark' : 'light';
  const st = S.settings;
  const r = document.documentElement.style;
  r.setProperty('--content-size', st.fontSize + 'px');
  r.setProperty('--content-width', st.contentWidth + 'px');
  r.setProperty('--content-line', st.lineHeight);
  document.documentElement.dataset.font = st.fontFamily;
  const b = document.body.classList;
  b.toggle('layout-full', st.layout === 'full');
  b.toggle('wrap-names', st.wrapLongNames);
  b.toggle('code-wrap', st.codeWrap === 'wrap');
  b.toggle('no-link-icons', !st.linkIndicators);
  b.toggle('no-sticky', !st.stickyHeaders);
  // Syntax theme: our adaptive token colors, or a highlight.js stylesheet.
  const link = $('#hljs-theme');
  b.toggle('hljs-themed', st.syntaxTheme !== 'auto');
  if (st.syntaxTheme === 'auto') link.disabled = true;
  else { link.href = `hljs/${st.syntaxTheme}.min.css`; link.disabled = false; }
  const themeIcon = { auto: 'sun-moon', light: 'sun', dark: 'moon', sepia: 'read' }[t];
  $('[data-act="toggle-theme"]').innerHTML = icon(themeIcon);
  $('[data-act="toggle-layout"]').innerHTML = icon(st.layout === 'full' ? 'wide' : 'centered');
}
const isDark = () => document.documentElement.dataset.theme === 'dark';

function updateTitle() {
  const src = S.source;
  $('#doc-name').textContent = src ? src.name : 'MarkCraft';
  $('#doc-name').title = src?.path || '';
  $('#dirty-dot').hidden = !S.dirty;
  document.body.classList.toggle('dirty', S.dirty);
  // The floating edit bar appears while editing or when there is something to save.
  $('#editbar').hidden = !src || (S.mode === 'read' && !S.dirty);
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
  els.doc.innerHTML = html || `<p class="empty-doc">${t('This document is empty.')}</p>`;
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
  $('#progress').hidden = !S.settings.readingProgress || !S.source || S.mode === 'source';
  if (!bar.hidden) $('#stats').textContent = formatStats(textStats(S.text.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~|\[\]()-]/g, ' ')));
  updateProgress();
}

function updateProgress() {
  const sc = els.scroller;
  const max = sc.scrollHeight - sc.clientHeight;
  const pct = max <= 0 ? 100 : Math.round((sc.scrollTop / max) * 100);
  $('#progress > div').style.width = pct + '%';
  const nearEnd = max > 0 && max - sc.scrollTop < 120;
  $('#statusbar').classList.toggle('away', S.settings.statsAutoHide && nearEnd);
  $('#scroll-top').hidden = sc.scrollTop < 600 || S.mode === 'source';
  if (nearEnd && max > 400 && S.settings.celebration && S.mode === 'read' && !S.celebrated) {
    S.celebrated = true;
    import('./confetti.js').then((m) => m.confetti());
  }
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
  updateTitle();
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
  S.celebrated = false;
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
      `<div class="perm-card"><h2>${escapeHtml(t('Allow access to “{name}”', { name: src.root ? src.root.name : src.name }))}</h2>
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
  showWelcome(`<div class="perm-card"><h2>${escapeHtml(t('Couldn’t open {name}', { name: src.name }))}</h2>
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
      <img class="logo" src="icons/128.png" alt="">
      <h1>MarkCraft</h1>
      <p class="tagline">${t('Read, edit and review Markdown — right in Chrome.')}</p>
      ${error ? `<p class="error-text">${escapeHtml(error)}</p>` : ''}
      <div class="welcome-actions">
        <button data-act="open">${icon('file')}${t('Open file…')}</button>
        <button data-act="open-folder">${icon('folder-open')}${t('Open folder…')}</button>
        <button data-act="new">${icon('new')}${t('New document')}</button>
      </div>
      <p class="hint">${t('or drop a .md file or folder anywhere on this page')} · <kbd>${isMac ? '⌘' : 'Ctrl+'}O</kbd></p>
      ${fileAccess ? '' : `<div class="notice">${t('To open file:// Markdown links directly, enable “Allow access to file URLs”.')} <button class="link" id="ext-settings">${t('Open settings')}</button></div>`}
      ${recent.length ? `<h3>${t('Recent')}</h3><ul class="recent">${recent.slice(0, 10).map((r) => `<li><a href="${VIEWER}${r.query}" data-internal="1">${icon(r.kind === 'url' && !r.path.startsWith('/') ? 'globe' : 'file', 18)}<span class="r-text"><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.path)}</span></span></a></li>`).join('')}</ul>` : ''}
    </div>`);
  $('#ext-settings')?.addEventListener('click', () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }));
  outline.build();
  if (!explorer.root) explorer.setRoot(null);
  $('#editbar').hidden = true;
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
  if (!window.showDirectoryPicker) {
    return modal(`<h2>${t('Folder access blocked')}</h2><p>${t('Your browser is blocking the File System Access API that MarkCraft needs to read local folders.')}</p>
      <ol><li>${t('Open the URL below in a new tab.')}<br><code>chrome://flags/#file-system-access-api</code></li><li>${t('Set the flag to “Enabled”.')}</li><li>${t('Fully quit and relaunch your browser - closing the tab is not enough.')}</li></ol>
      <div class="row"><span class="spacer"></span><button class="btn primary" value="ok">${t('Close')}</button></div>`);
  }
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
      setSidebar(true);
      return;
    }
  }
  explorerRootKey = id;
  await explorer.setRoot({ type: 'handle', handle: dir, id }, S.source?.key);
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
    setStatus(t('Saved {time}', { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }));
    if (!quiet) toast(t('Saved “{name}”', { name: S.source.name }), 'ok', 1600);
  } catch (e) {
    if (e.name === 'AbortError') return;
    toast(t('Save failed: {e}', { e: e.message }), 'error', 5000);
  }
}

// ---------- change detection ----------

let watchTimer = null;
let watchBusy = false;
function startWatch() {
  stopWatch();
  if (!S.source || S.source.kind === 'new' || !S.settings.autoRefresh) return;
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
  clone.querySelectorAll('.code-tools,.line-numbers,.diagram-zoom,.diagram-tools,.mint-tabbar').forEach((n) => n.remove());
  clone.querySelectorAll('[hidden]').forEach((n) => n.removeAttribute('hidden'));
  review.applyTo(clone);
  clone.querySelectorAll('.changed-flash,.flash,.zoomable').forEach((n) => n.classList.remove('changed-flash', 'flash', 'zoomable'));
  if (S.settings.tocInExport) clone.prepend(exportToc(clone));
  let html = clone.innerHTML;
  if (portable) {
    // String-level swap: assigning a relative src to an element would start loading it.
    html = html.replace(/<img([^>]*?) src="blob:[^"]*"([^>]*?) data-src="([^"]*)"/g, '<img$1 src="$3"$2').replace(/<img([^>]*?) data-src="([^"]*)"([^>]*?) src="blob:[^"]*"/g, '<img$1 src="$2"$3');
  }
  return html;
}

function exportToc(root) {
  const nav = document.createElement('nav');
  nav.className = 'export-toc';
  const heads = [...root.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')];
  const min = Math.min(...heads.map((h) => +h.tagName[1]));
  nav.innerHTML = `<h2>${t('Table of Contents')}</h2><ul>${heads.map((h) => `<li style="margin-left:${(+h.tagName[1] - min) * 1.2}em"><a href="#${h.id}">${escapeHtml(h.textContent)}</a></li>`).join('')}</ul>`;
  return nav;
}

async function exportHtml() {
  if (!(await exportWarnings('html'))) return;
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
  if (!(await exportWarnings('word'))) return;
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
    toast(t('Word export failed: {e}', { e: e.message }), 'error', 5000);
  } finally {
    tmp.remove();
  }
}

async function startPresentation() {
  if (S.mode === 'source') S.text = els.source.value;
  const { present, splitSlides } = await import('./present.js');
  const slides = splitSlides(S.text);
  if (!slides.length) return toast(t('No slides found. Use --- to separate slides.'));
  const items = [];
  const separated = /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/m.test(S.text.replace(FRONT_MATTER_RE, ''));
  if (!separated) items.push(t('No --- separators found, so slides are split at h1/h2 headings'));
  const long = slides.filter((s) => s.body.split('\n').filter((l) => l.trim()).length > 16).length;
  if (long) items.push(t('{n} slide(s) have a lot of content and may overflow the screen', { n: long }));
  if (slides.length === 1) items.push(t('The whole document fits on a single slide'));
  const ok = await warnModal({ title: 'Presentation Warnings', description: 'Your document may not present optimally', items,
    extra: `<p class="hint">${t('Tip: separate slides with a line containing only ---, and add speaker notes after a line starting with Note:')}</p>` });
  if (ok) present(S.text, renderCtx());
}

async function showMindMap() {
  if (S.mode === 'source') S.text = els.source.value;
  const items = [];
  const heads = (S.text.match(/^#{1,6}\s/gm) || []).length;
  if (!heads) items.push(t('No headings found for mind map; it is built from lists only'));
  if (heads > 300) items.push(t('This document has {n} headings; a large mind map may be slow', { n: heads }));
  if (!(await warnModal({ title: 'Mind Map Notice', description: 'Some issues were found with this document that may affect the mind map.', items }))) return;
  const { openMindMap } = await import('./mindmap.js');
  openMindMap(S.text, S.source.name).catch((e) => toast(t('Mind map failed: {e}', { e: e.message }), 'error'));
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
  if (!review.openComments.length) {
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
  fab.style.left = Math.max(8, Math.min(window.innerWidth - 300, rect.left)) + 'px';
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

function setPanel(open, tab) {
  S.layout.panelOpen = open;
  $('#panel').hidden = !open;
  document.body.classList.toggle('panel-open', open);
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

function combo(id) {
  return S.settings.shortcuts[id] || SHORTCUTS[id].combo;
}

function shortcutsHelp() {
  const rows = Object.entries(SHORTCUTS).map(([id, def]) => [comboLabel(combo(id)), def.label]);
  const extra = [
    [`${isMac ? '⌘' : 'Ctrl+'}G`, 'Next / previous match'],
    ['← → Space · F · N · T · A · ?', 'Presentation: navigate, fullscreen, notes, theme, auto-play, help'],
    ['+ − 0 · 1–6 · D · ?', 'Mind map: zoom, fit, collapse to depth, download, help'],
    [`${isMac ? '⌘' : 'Ctrl+'}T / N / W`, 'New tab / window / close (browser)'],
  ];
  modal(`<h2>${t('Keyboard Shortcuts')}</h2><p class="hint">${t('Quick access to all features')} · <button class="link" value="settings">${t('Customize…')}</button></p>
    <table class="keys">${[...rows, ...extra].map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${t(d)}</td></tr>`).join('')}</table>
    <div class="row"><span class="spacer"></span><button class="btn primary" value="ok">${t('Close')}</button></div>`,
  (body, dlg) => {
    dlg.onclose = () => { dlg.onclose = null; if (dlg.returnValue === 'settings') openSettings('shortcuts'); };
  });
}

// Settings modal (same panel as the options page).
let settingsUi;
async function openSettings(tab) {
  if (tab) sessionStorage.setItem('mc-settings-tab', tab);
  const dlg = $('#settings-modal');
  settingsUi?.destroy();
  settingsUi = await mountSettings($('#settings-root'), { onClose: () => dlg.close() });
  dlg.showModal();
}

async function whatsNewDialog() {
  const { RELEASES } = await import('./whatsnew.js');
  const sec = (title, list) => (list?.length ? `<h4>${t(title)}</h4><ul>${list.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '');
  const r = RELEASES[0];
  modal(`<h2>${t("What's New in v{v}", { v: r.version })}</h2>
    <div class="whatsnew">${sec('New Features', r.features)}${sec('Improvements', r.improvements)}${sec('Bug Fixes', r.fixes)}
    ${RELEASES.slice(1).map((o) => `<details><summary>v${o.version}</summary>${sec('New Features', o.features)}${sec('Improvements', o.improvements)}${sec('Bug Fixes', o.fixes)}</details>`).join('')}</div>
    <div class="row"><span class="spacer"></span><button class="btn primary" value="ok">${t('Got it')}</button></div>`);
}

// Shows a list of potential problems; resolves true when the user continues.
function warnModal({ title, description, items, continueLabel = 'Continue Anyway', extra = '' }) {
  if (!items.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    modal(`<h2>${t(title)}</h2><p class="hint">${t(description)}</p>
      <ul class="warn-list">${items.map((i) => `<li>${icon('info', 15)}<span>${escapeHtml(i)}</span></li>`).join('')}</ul>${extra}
      <div class="row"><span class="spacer"></span><button class="btn" value="cancel">${t('Cancel')}</button><button class="btn primary" value="go">${t(continueLabel)}</button></div>`,
    (body, dlg) => { dlg.onclose = () => { dlg.onclose = null; resolve(dlg.returnValue === 'go'); }; });
  });
}

async function exportWarnings(kind) {
  const root = S.mode === 'read' ? els.doc : null;
  const items = [];
  const broken = root?.querySelectorAll('img.broken').length || 0;
  if (broken) items.push(t('{n} image(s) could not be loaded and will be missing', { n: broken }));
  const diagErr = root?.querySelectorAll('.diagram-error').length || 0;
  if (diagErr) items.push(t('{n} diagram(s) failed to render; their source is exported instead', { n: diagErr }));
  const remote = root ? [...root.querySelectorAll('img[src^="http"]')].length : 0;
  if (remote && kind === 'html') items.push(t('{n} remote image(s) are linked, not embedded, and need an internet connection', { n: remote }));
  if (kind === 'word') {
    const words = textStats(S.text).words;
    if (words > 30000) items.push(t('This document has {n} words; Word export may take a while', { n: words.toLocaleString() }));
    if (root?.querySelector('.katex')) items.push(t('Math equations are exported as LaTeX text'));
  }
  return warnModal({ title: 'Export Warnings', description: 'Your document may have issues during export', items, continueLabel: 'Continue Export' });
}

function aboutDialog() {
  const m = chrome.runtime.getManifest();
  modal(`<div class="about"><img src="icons/128.png" width="72" height="72" alt=""><h2>MarkCraft</h2><p>v${m.version}</p>
    <p>${t('Read, edit and review Markdown — right in Chrome.')}</p><p class="hint">${t('All processing happens locally in your browser. No data collection.')}</p></div>
    <div class="row"><span class="spacer"></span><button class="btn primary" value="ok">${t('Close')}</button></div>`);
}

const SHORTCUT_ACTIONS = {
  toggleFiles: () => setSidebar(!S.layout.sidebarOpen),
  toggleToc: () => togglePanelTab('outline'),
  toggleAnnotations: () => togglePanelTab('comments'),
  toggleTheme: () => actions['toggle-theme'](),
  toggleLayout: () => actions['toggle-layout'](),
  toggleRaw: () => { if (!S.source) return; const raw = S.mode !== 'source'; setMode(raw ? 'source' : 'read'); toast(raw ? t('📝 Raw Markdown View') : t('✨ Rendered View'), '', 1200); },
  quickSettings: () => openSettings(),
  searchFolder: () => actions['search-folder'](),
  quickHighlight: () => S.source && review.annotate('highlight', 'yellow'),
  comment: () => S.source && startComment(),
  handoff: () => handoff(),
  toggleEdit: () => S.source && setMode(S.mode === 'read' ? 'edit' : 'read'),
  sourceMode: () => S.source && setMode(S.mode === 'source' ? 'read' : 'source'),
  find: () => S.source && find.open(),
  save: () => save(),
  saveAs: () => save({ as: true }),
  open: () => openFile(),
  print: () => S.source && printDoc(),
  present: () => S.source && startPresentation(),
  mindmap: () => S.source && showMindMap(),
  scrollTop: () => { els.scroller.scrollTo({ top: 0, behavior: 'smooth' }); toast(t('⬆️ Scrolled to top'), '', 1000); },
};

function togglePanelTab(tab) {
  const open = !$('#panel').hidden;
  if (open && S.layout.panelTab === tab) setPanel(false);
  else setPanel(true, tab);
}

function onKey(e) {
  if ($('#settings-modal').open) return;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const inField = e.target.matches?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]') || e.target.closest?.('.ProseMirror');
  const pressed = comboFromEvent(e);
  if (pressed) {
    for (const id of Object.keys(SHORTCUTS)) {
      if (combo(id) !== pressed) continue;
      if (inField && !pressed.includes('Mod') && !pressed.includes('Alt')) break; // plain keys only outside text fields
      e.preventDefault();
      e.stopPropagation();
      SHORTCUT_ACTIONS[id]();
      return;
    }
  }
  if (mod && e.key.toLowerCase() === 'g' && S.source) {
    e.preventDefault();
    return find.isOpen ? find.step(e.shiftKey ? -1 : 1) : find.open();
  }
  if (e.key === 'Escape') {
    if (find.isOpen) find.close();
    hideFab();
    closeMenus();
  }
  if (e.key === '?' && !inField && !mod) shortcutsHelp();
}

function closeMenus(except) {
  for (const m of ['#actions-menu', '#fx-sort-menu', '#fx-more-menu']) if (m !== except) $(m).hidden = true;
  $('[data-act="actions"]').classList.toggle('active', except === '#actions-menu');
}

function toggleMenu(sel) {
  const open = $(sel).hidden;
  closeMenus(open ? sel : null);
  $(sel).hidden = !open;
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

const folders = setupFolderTools({
  explorer,
  toast,
  showFiles: () => setSidebar(true),
  openAt: async (href, query, newTab) => {
    if (newTab) return window.open(href, '_blank');
    await navigate(href);
    find.open();
    find.input.value = query;
    find.search(true);
  },
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
  settings: () => openSettings(),
  about: () => aboutDialog(),
  'whats-new': () => whatsNewDialog(),
  actions: () => toggleMenu('#actions-menu'),
  'toggle-edit': () => S.source && setMode(S.mode === 'read' ? 'edit' : 'read'),
  'toggle-theme': async () => {
    const order = ['auto', 'light', 'dark', 'sepia'];
    const next = order[(order.indexOf(S.settings.theme) + 1) % order.length];
    S.settings = await setSettings({ theme: next });
    toast({ auto: t('Auto Theme'), light: t('Light Theme'), dark: t('Dark Theme'), sepia: t('Sepia Theme') }[next], '', 1200);
  },
  'toggle-layout': async () => {
    S.settings = await setSettings({ layout: S.settings.layout === 'full' ? 'centered' : 'full' });
    toast(S.settings.layout === 'full' ? t('Full-Width Layout') : t('Centered Layout'), '', 1200);
  },
  'scroll-top': () => els.scroller.scrollTo({ top: 0, behavior: 'smooth' }),
  'search-folder': () => {
    if (!explorer.root) { setSidebar(true); return toast(t('No folder is currently open')); }
    setSidebar(true);
    $('#fx-search-box').hidden = false;
    $('#fx-search').focus();
  },
  'fx-filter': () => {
    const box = $('#fx-filter-box');
    box.hidden = !box.hidden;
    if (box.hidden) { $('#fx-filter').value = ''; explorer.setFilter(''); } else $('#fx-filter').focus();
  },
  'fx-sort': () => { syncSortMenu(); toggleMenu('#fx-sort-menu'); },
  'fx-more': () => toggleMenu('#fx-more-menu'),
  'fx-refresh': () => explorer.refresh(),
  'fx-expand': () => explorer.expandAll(),
  'fx-collapse': () => explorer.collapseAll(),
  'toc-search': () => {
    const box = $('#toc-filter-box');
    box.hidden = !box.hidden;
    if (box.hidden) { $('#toc-filter').value = ''; outline.applyFilter(); } else $('#toc-filter').focus();
  },
  'toc-expand': () => outline.expandAll(),
  'toc-collapse': () => outline.collapseAll(),
  'plantuml-consent': () => plantumlConsent(),
  handoff: () => handoff(),
  'clear-comments': () => { if (review.items.length && confirm(t('Delete all review comments for this document?'))) review.clearAll(); },
  'ext-accept': () => acceptExternal(),
  'ext-dismiss': () => dismissExternal(),
  'ext-diff': () => showExternalDiff(),
  'banner-close': () => hideBanner(),
  'bookmark-folder': () => folders.toggleBookmark(),
  bookmarks: () => folders.toggleList(),
  'grant-folder': () => { hideBanner(); openFolder(); },
};

function plantumlConsent() {
  let host = S.settings.plantumlServer;
  try { host = new URL(host).host; } catch {}
  modal(`<h2>${t('Allow public diagram server?')}</h2>
    <p>${escapeHtml(t('Rendering this diagram requires sending its source code to a third-party server ({server}).', { server: host }))}</p>
    <p class="hint">${t('This is the only MarkCraft feature that sends any part of your document off your device. You can change your decision at any time in Settings → PlantUML.')}</p>
    <div class="row"><span class="spacer"></span><button class="btn" value="later">${t('Decide later')}</button><button class="btn primary" value="agree">${t('Agree')}</button></div>`,
  (body, dlg) => {
    dlg.onclose = async () => {
      dlg.onclose = null;
      if (dlg.returnValue === 'agree') S.settings = await setSettings({ plantumlConsent: true, plugins: { ...S.settings.plugins, plantuml: true } });
    };
  });
}

function syncSortMenu() {
  const L = S.layout;
  $$('#fx-sort-menu [data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === L.fxSort));
  $$('#fx-sort-menu [data-sort-dir]').forEach((b) => b.classList.toggle('on', (b.dataset.sortDir === 'desc') === L.fxSortDesc));
  $('#fx-sort-menu [data-sort-toggle]').classList.toggle('on', L.fxFoldersFirst);
  $$('#fx-sort-menu [data-group]').forEach((b) => b.classList.toggle('on', b.dataset.group === (L.fxGroup || 'none')));
  const txt = $('#fx-sort-menu [data-filter-type]');
  txt.classList.toggle('on', L.fxShowTxt && S.settings.renderTxt);
  txt.disabled = !S.settings.renderTxt;
  txt.title = S.settings.renderTxt ? '' : t('Enable .txt rendering in Settings to use this filter');
}

$('#fx-sort-menu').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const L = S.layout;
  if (b.dataset.sort) L.fxSort = b.dataset.sort;
  if (b.dataset.sortDir) L.fxSortDesc = b.dataset.sortDir === 'desc';
  if (b.dataset.sortToggle) L.fxFoldersFirst = !L.fxFoldersFirst;
  if (b.dataset.filterType) L.fxShowTxt = !L.fxShowTxt;
  if (b.dataset.group) L.fxGroup = b.dataset.group;
  saveLayout({ fxSort: L.fxSort, fxSortDesc: L.fxSortDesc, fxFoldersFirst: L.fxFoldersFirst, fxShowTxt: L.fxShowTxt, fxGroup: L.fxGroup });
  syncSortMenu();
  explorer.setOptions(explorerOptions());
});

function explorerOptions() {
  const L = S.layout;
  return {
    sort: L.fxSort, desc: L.fxSortDesc, foldersFirst: L.fxFoldersFirst, showTxt: L.fxShowTxt && S.settings.renderTxt, group: L.fxGroup || 'none',
    exclude: S.settings.excludeFoldersOn ? S.settings.excludeFolders : [],
  };
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!e.target.closest('.menu, .actions-grid, [data-act="actions"], [data-act="fx-sort"], [data-act="fx-more"]')) closeMenus();
  if (btn && actions[btn.dataset.act] && !btn.closest('#findbar, #composer, #agent-pane, #term-pane, .comment-card, #settings-modal')) {
    if (btn.closest('.menu, .actions-grid') ) closeMenus();
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
$$('[data-ptab]').forEach((b) => b.addEventListener('click', () => setPanel(true, b.dataset.ptab)));
fab.addEventListener('mousedown', (e) => e.preventDefault());
fab.addEventListener('click', (e) => {
  const b = e.target.closest('[data-anno]');
  if (!b) return;
  hideFab();
  if (b.dataset.anno === 'comment') return startComment();
  review.annotate(b.dataset.anno, b.dataset.color);
  if (S.layout.panelOpen) setPanel(true, 'comments');
});
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

$('#fx-filter').addEventListener('input', (e) => explorer.setFilter(e.target.value));

window.addEventListener('keydown', onKey, true);
window.addEventListener('beforeunload', (e) => {
  if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('popstate', () => {
  if (!confirmDiscard()) return history.pushState(null, '', VIEWER + (S.source?.query || ''));
  openFromLocation();
});
// Bake annotations into the page for printing, then restore the live rendering.
window.addEventListener('beforeprint', () => {
  if (S.mode !== 'read') return;
  if (review.items.length) review.applyTo(els.doc);
  if (S.settings.tocInExport) els.doc.prepend(exportToc(els.doc));
  S.printBaked = review.items.length > 0 || S.settings.tocInExport;
});
window.addEventListener('afterprint', () => { if (S.printBaked) { S.printBaked = false; renderRead(); } });
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
  const keys = ['theme', 'plugins', 'lineBreaks', 'codeLineNumbers', 'textDirection', 'plantumlServer', 'plantumlConsent', 'frontMatterCard', 'localizeAlerts'];
  const rerender = keys.some((k) => JSON.stringify(prev[k]) !== JSON.stringify(settings[k]));
  if (rerender && S.mode === 'read' && S.source) renderRead();
  if (prev.pollInterval !== settings.pollInterval || prev.autoRefresh !== settings.autoRefresh) startWatch();
  if (['excludeFolders', 'excludeFoldersOn', 'renderTxt'].some((k) => JSON.stringify(prev[k]) !== JSON.stringify(settings[k]))) explorer.setOptions(explorerOptions());
  updateStats();
});

async function init() {
  [S.settings, S.layout] = await Promise.all([getSettings(), getLayout()]);
  setLanguage(S.settings.language);
  hydrateIcons();
  localize();
  applyTheme();
  setupResizers();
  setupDrop();
  explorer.setOptions(explorerOptions(), false);
  document.body.classList.toggle('sidebar-closed', !S.layout.sidebarOpen);
  if (S.layout.panelOpen) setPanel(true, S.layout.panelTab);
  else $$('[data-ptab]').forEach((b) => b.classList.toggle('active', b.dataset.ptab === S.layout.panelTab));
  $$('[data-ppane]').forEach((p) => (p.hidden = p.dataset.ppane !== S.layout.panelTab));
  await openFromLocation();
  const { pendingWhatsNew } = await chrome.storage.local.get('pendingWhatsNew');
  if (pendingWhatsNew) {
    chrome.storage.local.remove('pendingWhatsNew');
    if (S.settings.whatsNew) whatsNewDialog();
  }
}

init();

// Exposed for automated tests.
window.__markcraft = { S, setMode, save, acceptExternal, review, native, db, UrlSource };
