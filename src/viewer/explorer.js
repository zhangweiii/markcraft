// File explorer sidebar: browses a picked folder (File System Access) or the
// directory of a file:// document (via Chrome's directory listing).
import { MD_EXT, VIEWER } from './sources.js';
import { escapeHtml } from './render.js';

const IGNORED = /^(\.|node_modules$|__pycache__$)/;

function parseListing(html, base) {
  // Chrome's file:// directory pages call addRow(name, url, isdir, ...).
  const out = [];
  for (const m of html.matchAll(/addRow\("((?:\\.|[^"\\])*)","((?:\\.|[^"\\])*)",(\d)/g)) {
    const name = JSON.parse(`"${m[1]}"`);
    if (name === '..' || name === '.') continue;
    out.push({ name, kind: m[3] === '1' ? 'dir' : 'file', url: new URL(JSON.parse(`"${m[2]}"`), base).href });
  }
  return out;
}

function sortEntries(list) {
  return list
    .filter((e) => !IGNORED.test(e.name) && (e.kind === 'dir' || MD_EXT.test(e.name)))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.kind === 'dir' ? -1 : 1));
}

export class Explorer {
  constructor({ el, titleEl, upBtn, onOpen }) {
    this.el = el;
    this.titleEl = titleEl;
    this.upBtn = upBtn;
    this.onOpen = onOpen;
    this.expanded = new Set(JSON.parse(sessionStorage.getItem('mc-expanded') || '[]'));
    el.addEventListener('click', (e) => {
      const row = e.target.closest('.fx-row');
      if (!row) return;
      e.preventDefault();
      const node = row._node;
      if (node.kind === 'dir') this.toggle(row, node);
      else this.onOpen(node.href, e.metaKey || e.ctrlKey);
    });
    upBtn.addEventListener('click', () => {
      if (this.root?.type !== 'url') return;
      const parent = new URL('..', this.root.url).href;
      if (parent !== this.root.url) this.setRoot({ type: 'url', url: parent });
    });
  }

  async setRoot(root, currentKey) {
    this.root = root;
    if (currentKey !== undefined) this.currentKey = currentKey;
    this.upBtn.hidden = root?.type !== 'url' || new URL(root.url).pathname === '/';
    if (!root) {
      this.titleEl.textContent = 'Files';
      this.el.innerHTML = '<div class="empty-hint">Open a folder to browse its Markdown files.<br><button class="btn small" data-act="open-folder">Open folder…</button></div>';
      return;
    }
    this.titleEl.textContent = root.type === 'url' ? decodeURIComponent(new URL(root.url).pathname) : root.handle.name;
    this.titleEl.title = this.titleEl.textContent;
    this.el.innerHTML = '';
    const top = { kind: 'dir', name: '', path: '', ...(root.type === 'url' ? { url: root.url } : { handle: root.handle }) };
    const list = document.createElement('div');
    list.className = 'fx-children';
    this.el.append(list);
    try {
      await this.fill(list, top, 0);
    } catch (e) {
      this.el.innerHTML = `<div class="empty-hint">Cannot list folder: ${escapeHtml(e.message)}</div>`;
    }
  }

  async list(node) {
    if (node.url) {
      const html = await (await fetch(node.url, { cache: 'no-store' })).text();
      return sortEntries(parseListing(html, node.url)).map((e) => ({
        ...e,
        path: node.path ? `${node.path}/${e.name}` : e.name,
        href: e.kind === 'file' ? VIEWER + '?file=' + encodeURIComponent(e.url) : null,
      }));
    }
    const entries = [];
    for await (const [name, handle] of node.handle.entries()) entries.push({ name, kind: handle.kind === 'directory' ? 'dir' : 'file', handle });
    return sortEntries(entries).map((e) => {
      const path = node.path ? `${node.path}/${e.name}` : e.name;
      return { ...e, path, href: e.kind === 'file' ? VIEWER + `?root=${this.root.id}&path=${encodeURIComponent(path)}` : null };
    });
  }

  keyOf(node) {
    return node.url ? node.url : `root:${this.root.id}:${node.path}`;
  }

  async fill(container, node, depth) {
    const items = await this.list(node);
    if (!items.length && depth === 0) container.innerHTML = '<div class="empty-hint">No Markdown files here</div>';
    for (const child of items) {
      const row = document.createElement('a');
      row.className = `fx-row ${child.kind}`;
      row.style.setProperty('--depth', depth);
      row.innerHTML = `<span class="fx-icon"></span><span class="fx-name">${escapeHtml(child.name)}</span>`;
      row.title = child.path;
      if (child.href) row.href = child.href;
      row._node = child;
      const fileKey = child.url || `root:${this.root.id}:${child.path}`;
      if (child.kind === 'file' && fileKey === this.currentKey) row.classList.add('current');
      container.append(row);
      if (child.kind === 'dir') {
        const sub = document.createElement('div');
        sub.className = 'fx-children';
        sub.hidden = true;
        container.append(sub);
        row._sub = sub;
        if (this.expanded.has(this.keyOf(child))) this.toggle(row, child);
      }
    }
  }

  async toggle(row, node) {
    const sub = row._sub;
    const key = this.keyOf(node);
    if (!sub.hidden) {
      sub.hidden = true;
      row.classList.remove('open');
      this.expanded.delete(key);
    } else {
      sub.hidden = false;
      row.classList.add('open');
      this.expanded.add(key);
      if (!sub.dataset.loaded) {
        sub.dataset.loaded = '1';
        await this.fill(sub, node, (+row.style.getPropertyValue('--depth') || 0) + 1).catch((e) => {
          sub.innerHTML = `<div class="empty-hint">${escapeHtml(e.message)}</div>`;
        });
      }
    }
    sessionStorage.setItem('mc-expanded', JSON.stringify([...this.expanded]));
  }

  markCurrent(key) {
    this.currentKey = key;
    for (const row of this.el.querySelectorAll('.fx-row.file')) {
      const n = row._node;
      row.classList.toggle('current', (n.url || `root:${this.root?.id}:${n.path}`) === key);
    }
  }
}
