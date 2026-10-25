// Where a document comes from and how to read, watch, write and resolve relative paths.
import { db, storeHandle } from '../shared/db.js';

export const MD_EXT = /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdtxt|mdtext|mdx|rmd|qmd|txt)$/i;
export const VIEWER = chrome.runtime.getURL('viewer.html');
export const PICKER_TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd', '.mdx', '.txt'] } }];

async function writeHandle(handle, text) {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

async function ensurePermission(handle, interactive) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (!interactive) return false;
  return (await handle.requestPermission(opts)) === 'granted';
}

class AssetCache {
  constructor() { this.map = new Map(); }
  async get(key, load) {
    if (!this.map.has(key)) this.map.set(key, load().then((blob) => (blob ? URL.createObjectURL(blob) : null)).catch(() => null));
    return this.map.get(key);
  }
  clear() {
    for (const p of this.map.values()) p.then((u) => u && URL.revokeObjectURL(u));
    this.map.clear();
  }
}

export class UrlSource {
  constructor(url) {
    this.kind = 'url';
    this.url = url.split('#')[0];
    const u = new URL(this.url);
    this.isFile = u.protocol === 'file:';
    this.path = this.isFile ? decodeURIComponent(u.pathname) : this.url;
    this.name = decodeURIComponent(u.pathname.split('/').pop() || '') || u.hostname || 'Untitled';
    this.key = this.url;
    this.query = '?file=' + encodeURIComponent(url);
    this.dirUrl = new URL('.', this.url).href;
    this.assets = new AssetCache();
    this.pollInterval = this.isFile ? null : 5000;
  }

  get dirPath() { return this.isFile ? decodeURIComponent(new URL(this.dirUrl).pathname) : null; }
  get writable() { return this.isFile || !!this.bound; }

  async init() {
    const rec = await db.get('bindings', this.key);
    if (rec?.handle) this.bound = rec.handle;
  }

  async read() {
    const r = await fetch(this.url, { cache: 'no-store' });
    if (!this.isFile && !r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return r.text();
  }

  // Returns {text} when the content may have changed (caller compares), or null.
  async check() {
    return { text: await this.read() };
  }

  // Returns a new source when the user chose to save somewhere else.
  async write(text) {
    if (this.bound && (await ensurePermission(this.bound, true))) return writeHandle(this.bound, text);
    // Extensions cannot write to file:// URLs: ask once for the file and remember it.
    const handle = await showSaveFilePicker({ suggestedName: this.name, types: PICKER_TYPES });
    await writeHandle(handle, text);
    if (handle.name === this.name && this.isFile) {
      this.bound = handle;
      await db.set('bindings', this.key, { handle });
      return null;
    }
    const id = await storeHandle(handle);
    return new HandleSource(handle, { id });
  }

  resolve(href) { return new URL(href, this.url).href; }

  resolveAsset(href) {
    const url = this.resolve(href);
    if (!url.startsWith('file:')) return Promise.resolve(url);
    return this.assets.get(url, async () => (await fetch(url)).blob());
  }

  resolveLink(href) {
    let u;
    try { u = new URL(href, this.url); } catch { return null; }
    if (!/^(file|https?):$/.test(u.protocol) || !MD_EXT.test(decodeURIComponent(u.pathname))) return null;
    return VIEWER + '?file=' + encodeURIComponent(u.href);
  }
}

export class HandleSource {
  constructor(handle, { id, root, rootId, relPath } = {}) {
    this.kind = 'handle';
    this.handle = handle;
    this.id = id;
    this.root = root;
    this.rootId = rootId;
    this.relPath = relPath;
    this.name = handle.name;
    this.path = root ? `${root.name}/${relPath}` : handle.name;
    this.key = root ? `root:${rootId}:${relPath}` : `h:${id}`;
    this.query = root ? `?root=${rootId}&path=${encodeURIComponent(relPath)}` : `?h=${id}`;
    this.assets = new AssetCache();
    this.writable = true;
  }

  needsPermission() { return ensurePermission(this.root || this.handle, false).then((ok) => !ok); }
  requestPermission() { return ensurePermission(this.root || this.handle, true); }
  async init() {}

  async read() {
    const f = await this.handle.getFile();
    this.stamp = `${f.lastModified}:${f.size}`;
    return f.text();
  }

  async check() {
    const f = await this.handle.getFile();
    const stamp = `${f.lastModified}:${f.size}`;
    if (stamp === this.stamp) return null;
    this.stamp = stamp;
    return { text: await f.text() };
  }

  async write(text) {
    if (!(await ensurePermission(this.handle, true))) throw new Error('Write permission denied');
    await writeHandle(this.handle, text);
    const f = await this.handle.getFile();
    this.stamp = `${f.lastModified}:${f.size}`;
    return null;
  }

  // Path of `href` relative to the root folder, or null when it escapes it.
  relative(href) {
    if (!this.root || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null;
    const clean = decodeURIComponent(href.split(/[?#]/)[0]);
    const parts = clean.startsWith('/') ? [] : this.relPath.split('/').slice(0, -1);
    for (const seg of clean.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(seg);
    }
    return parts.join('/');
  }

  async fileAt(rel) {
    const segs = rel.split('/');
    let dir = this.root;
    for (const s of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(s);
    return dir.getFileHandle(segs.at(-1));
  }

  resolveAsset(href) {
    const rel = this.relative(href);
    if (rel == null) return Promise.resolve(/^https?:/.test(href) ? href : null);
    return this.assets.get(rel, async () => (await this.fileAt(rel)).getFile());
  }

  resolveLink(href) {
    const rel = this.relative(href);
    if (rel == null || !MD_EXT.test(rel)) return null;
    const hash = href.includes('#') ? '#' + href.split('#')[1] : '';
    return VIEWER + `?root=${this.rootId}&path=${encodeURIComponent(rel)}${hash}`;
  }
}

export class NewSource {
  constructor() {
    this.kind = 'new';
    this.name = 'Untitled.md';
    this.path = 'Untitled.md';
    this.key = null;
    this.query = '?new=1';
    this.writable = false;
    this.assets = new AssetCache();
  }
  async init() {}
  async read() { return ''; }
  async check() { return null; }
  async write(text) {
    const handle = await showSaveFilePicker({ suggestedName: this.name, types: PICKER_TYPES });
    await writeHandle(handle, text);
    const id = await storeHandle(handle);
    return new HandleSource(handle, { id });
  }
  resolveAsset(href) { return Promise.resolve(/^https?:/.test(href) ? href : null); }
  resolveLink() { return null; }
}

// Build the source described by the viewer's query string.
export async function sourceFromQuery(params) {
  if (params.get('file')) return new UrlSource(params.get('file'));
  if (params.get('h')) {
    const rec = await db.get('handles', params.get('h'));
    if (!rec) throw new Error('This file is no longer available. Open it again.');
    return new HandleSource(rec.handle, { id: params.get('h') });
  }
  if (params.get('root') && params.get('path')) {
    const rec = await db.get('handles', params.get('root'));
    if (!rec) throw new Error('This folder is no longer available. Open it again.');
    const relPath = params.get('path');
    const src = new HandleSource({ name: relPath.split('/').pop() }, { root: rec.handle, rootId: params.get('root'), relPath });
    src.pendingResolve = async () => { src.handle = await src.fileAt(relPath); };
    return src;
  }
  if (params.get('new')) return new NewSource();
  return null;
}

export async function sourceFromHandle(handle) {
  const id = await storeHandle(handle);
  return new HandleSource(handle, { id });
}
