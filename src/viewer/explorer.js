// File explorer sidebar: browses a picked folder (File System Access) or the
// directory of a file:// document (via Chrome's directory listing).
import { VIEWER } from './sources.js';
import { escapeHtml } from './render.js';
import { icon } from '../shared/icons.js';
import { t } from '../shared/i18n.js';

const MD_ONLY = /\.(md|markdown|mdown|mkd|mkdn|mdwn|mdtxt|mdtext|mdx|rmd|qmd)$/i;

function parseListing(html, base) {
  // Chrome's file:// directory pages call addRow(name, url, isdir, size, sizeText, mtime, mtimeText).
  const out = [];
  for (const m of html.matchAll(/addRow\("((?:\\.|[^"\\])*)","((?:\\.|[^"\\])*)",(\d),(\d+),"(?:\\.|[^"\\])*",(\d+)/g)) {
    const name = JSON.parse(`"${m[1]}"`);
    if (name === '..' || name === '.') continue;
    const isDir = m[3] === '1';
    let href = JSON.parse(`"${m[2]}"`);
    if (isDir && !href.endsWith('/')) href += '/'; // so children resolve inside it
    out.push({ name, kind: isDir ? 'dir' : 'file', url: new URL(href, base).href, size: +m[4], mtime: +m[5] * 1000 });
  }
  return out;
}

export class Explorer {
  constructor({ el, titleEl, upBtn, onOpen }) {
    this.el = el;
    this.titleEl = titleEl;
    this.upBtn = upBtn;
    this.onOpen = onOpen;
    this.opts = { sort: 'name', desc: false, foldersFirst: true, showTxt: true, exclude: [] };
    this.filter = '';
    this.expanded = new Set(JSON.parse(sessionStorage.getItem('mc-expanded') || '[]'));
    el.addEventListener('click', (e) => {
      const row = e.target.closest('.fx-row');
      if (!row) return;
      e.preventDefault();
      const node = row._node;
      if (node.kind === 'dir') this.toggle(row, node);
      else this.onOpen(node.href, e.metaKey || e.ctrlKey || e.shiftKey);
    });
    upBtn.addEventListener('click', () => {
      if (this.root?.type !== 'url') return;
      const parent = new URL('..', this.root.url).href;
      if (parent !== this.root.url) this.setRoot({ type: 'url', url: parent });
    });
  }

  setOptions(opts, rerender = true) {
    this.opts = { ...this.opts, ...opts };
    if (rerender && this.root) this.refresh();
  }

  accept(e) {
    if (e.name.startsWith('.')) return false;
    if (e.kind === 'dir') return !this.opts.exclude.includes(e.name);
    return MD_ONLY.test(e.name) || (this.opts.showTxt && /\.txt$/i.test(e.name));
  }

  sorted(list) {
    const { sort, desc, foldersFirst } = this.opts;
    const cmp = (a, b) => {
      let r = 0;
      if (sort === 'modified') r = (a.mtime || 0) - (b.mtime || 0);
      if (sort === 'size') r = (a.size || 0) - (b.size || 0);
      if (!r) r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      return desc ? -r : r;
    };
    return list.filter((e) => this.accept(e)).sort((a, b) => (foldersFirst && a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : cmp(a, b)));
  }

  async setRoot(root, currentKey) {
    this.root = root;
    if (currentKey !== undefined) this.currentKey = currentKey;
    this.upBtn.hidden = root?.type !== 'url' || new URL(root.url).pathname === '/';
    if (!root) {
      this.titleEl.textContent = t('Files');
      this.el.innerHTML = `<div class="fx-empty"><div class="big-ic">${icon('folder', 34)}</div>
        <h4>${t('Browse Markdown Files')}</h4>
        <p>${t('Select the folder containing your markdown files to enable navigation.')}</p>
        <button class="btn primary" data-act="open-folder">${t('Select Folder')}</button>
        <button class="btn" data-act="toggle-sidebar">${t('Close Sidebar')}</button>
        <p class="tip">💡 ${t('Once selected, this folder will be remembered')}</p></div>`;
      return;
    }
    const name = root.type === 'url' ? decodeURIComponent(new URL(root.url).pathname).replace(/\/$/, '').split('/').pop() || '/' : root.handle.name;
    this.titleEl.textContent = name;
    this.titleEl.title = root.type === 'url' ? decodeURIComponent(new URL(root.url).pathname) : root.handle.name;
    await this.render();
  }

  rootNode() {
    return { kind: 'dir', name: '', path: '', ...(this.root.type === 'url' ? { url: this.root.url } : { handle: this.root.handle }) };
  }

  async render() {
    const scroll = this.el.scrollTop;
    this.el.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'fx-children';
    this.el.append(list);
    try {
      if (this.filter) await this.renderFiltered(list);
      else await this.fill(list, this.rootNode(), 0);
    } catch (e) {
      this.el.innerHTML = `<div class="empty-hint">${t('Failed to scan directory:')} ${escapeHtml(e.message)}</div>`;
    }
    this.el.scrollTop = scroll;
  }

  refresh() {
    return this.root ? this.render() : null;
  }

  async setFilter(q) {
    this.filter = q.trim().toLowerCase();
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.render(), 150);
  }

  async renderFiltered(container) {
    const token = (this.filterToken = {});
    let n = 0;
    for await (const file of this.walk()) {
      if (token !== this.filterToken) return;
      if (!file.path.toLowerCase().includes(this.filter)) continue;
      container.append(this.row(file, 0, true));
      if (++n > 500) break;
    }
    if (!n) container.innerHTML = `<div class="empty-hint">${t('No documents match your search')}</div>`;
  }

  async list(node) {
    let entries = [];
    if (node.url) {
      const html = await (await fetch(node.url, { cache: 'no-store' })).text();
      entries = parseListing(html, node.url);
    } else {
      for await (const [name, handle] of node.handle.entries()) entries.push({ name, kind: handle.kind === 'directory' ? 'dir' : 'file', handle });
      if (this.opts.sort !== 'name') {
        await Promise.all(entries.filter((e) => e.kind === 'file').map(async (e) => {
          const f = await e.handle.getFile().catch(() => null);
          if (f) { e.size = f.size; e.mtime = f.lastModified; }
        }));
      }
    }
    return this.sorted(entries).map((e) => {
      const path = node.path ? `${node.path}/${e.name}` : e.name;
      const href = e.kind !== 'file' ? null : e.url ? VIEWER + '?file=' + encodeURIComponent(e.url) : VIEWER + `?root=${this.root.id}&path=${encodeURIComponent(path)}`;
      return { ...e, path, href };
    });
  }

  keyOf(node) {
    return node.url ? node.url : `root:${this.root.id}:${node.path}`;
  }

  row(child, depth, showPath = false) {
    const row = document.createElement('a');
    row.className = `fx-row ${child.kind}`;
    row.style.setProperty('--depth', depth);
    const ic = child.kind === 'dir' ? icon(this.expanded.has(this.keyOf(child)) ? 'folder-open' : 'folder', 16) : icon('file', 16);
    const meta = this.opts.sort === 'size' && child.size != null ? `${Math.max(1, Math.round(child.size / 1024))} KB`
      : this.opts.sort === 'modified' && child.mtime ? new Date(child.mtime).toLocaleDateString() : '';
    row.innerHTML = `<span class="fx-icon">${ic}</span><span class="fx-name">${escapeHtml(showPath ? child.path : child.name)}</span>${meta && child.kind === 'file' ? `<span class="fx-meta">${meta}</span>` : ''}`;
    row.title = child.path;
    if (child.href) row.href = child.href;
    row._node = child;
    if (child.kind === 'file' && this.keyOf(child) === this.currentKey) row.classList.add('current');
    return row;
  }

  async fill(container, node, depth) {
    const items = await this.list(node);
    if (!items.length && depth === 0) container.innerHTML = `<div class="empty-hint">${t('No markdown files found in this directory.')}</div>`;
    for (const child of items) {
      const row = this.row(child, depth);
      container.append(row);
      if (child.kind === 'dir') {
        const sub = document.createElement('div');
        sub.className = 'fx-children';
        sub.hidden = true;
        container.append(sub);
        row._sub = sub;
        if (this.expanded.has(this.keyOf(child))) await this.toggle(row, child, true);
      }
    }
  }

  async toggle(row, node, forceOpen = false) {
    const sub = row._sub;
    const key = this.keyOf(node);
    const open = forceOpen || sub.hidden;
    sub.hidden = !open;
    row.classList.toggle('open', open);
    row.querySelector('.fx-icon').innerHTML = icon(open ? 'folder-open' : 'folder', 16);
    if (open) this.expanded.add(key);
    else this.expanded.delete(key);
    if (open && !sub.dataset.loaded) {
      sub.dataset.loaded = '1';
      await this.fill(sub, node, (+row.style.getPropertyValue('--depth') || 0) + 1).catch((e) => {
        sub.innerHTML = `<div class="empty-hint">${escapeHtml(e.message)}</div>`;
      });
    }
    sessionStorage.setItem('mc-expanded', JSON.stringify([...this.expanded]));
  }

  async expandAll() {
    if (!this.root) return;
    const walkDirs = async (node, depth) => {
      if (depth > 6) return;
      for (const child of await this.list(node).catch(() => [])) {
        if (child.kind === 'dir') { this.expanded.add(this.keyOf(child)); await walkDirs(child, depth + 1); }
      }
    };
    await walkDirs(this.rootNode(), 0);
    sessionStorage.setItem('mc-expanded', JSON.stringify([...this.expanded]));
    this.render();
  }

  collapseAll() {
    this.expanded.clear();
    sessionStorage.setItem('mc-expanded', '[]');
    this.render();
  }

  // Depth-first walk of every Markdown file under the root.
  async *walk(node = null, depth = 0) {
    node ||= this.rootNode();
    if (depth > 12) return;
    let items;
    try { items = await this.list(node); } catch { return; }
    for (const child of items) {
      if (child.kind === 'dir') yield* this.walk(child, depth + 1);
      else yield child;
    }
  }

  async readFile(node) {
    if (node.url) return (await fetch(node.url, { cache: 'no-store' })).text();
    return (await node.handle.getFile()).text();
  }

  // Full-text search; calls onHit(file, matches, count) as results arrive.
  async search(query, onHit, signal, { caseSensitive = false, wholeWord = false, regex = false } = {}) {
    let re;
    const src = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { re = new RegExp(wholeWord ? `\\b(?:${src})\\b` : src, caseSensitive ? 'g' : 'gi'); } catch (e) { throw new Error(t('Invalid regex pattern: {0}', { 0: query })); }
    let files = 0;
    for await (const file of this.walk()) {
      if (signal.aborted || files++ > 3000) break;
      const text = await this.readFile(file).catch(() => '');
      re.lastIndex = 0;
      const count = (text.match(re) || []).length;
      if (!count) continue;
      const matches = [];
      const lines = text.split('\n');
      for (let i = 0; i < lines.length && matches.length < 5; i++) {
        re.lastIndex = 0;
        const m = re.exec(lines[i]);
        if (m) matches.push({ line: i + 1, text: lines[i], at: m.index, len: m[0].length });
      }
      onHit(file, matches, count);
    }
    return files;
  }

  markCurrent(key) {
    this.currentKey = key;
    for (const row of this.el.querySelectorAll('.fx-row.file')) row.classList.toggle('current', this.keyOf(row._node) === key);
  }
}

