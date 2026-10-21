// Folder bookmarks and full-text search across the open folder.
import { db } from '../shared/db.js';
import { escapeHtml } from './render.js';
import { t } from '../shared/i18n.js';

const $ = (s) => document.querySelector(s);

async function getBookmarks() {
  return (await chrome.storage.local.get('folderBookmarks')).folderBookmarks || [];
}
async function setBookmarks(list) {
  await chrome.storage.local.set({ folderBookmarks: list });
}

function rootKey(root) {
  return root ? (root.type === 'url' ? root.url : `h:${root.id}`) : null;
}

function rootName(root) {
  if (root.type === 'handle') return root.handle.name;
  const parts = decodeURIComponent(new URL(root.url).pathname).split('/').filter(Boolean);
  return parts.at(-1) || '/';
}

export function setupFolderTools({ explorer, openAt, toast, showFiles }) {
  const star = $('#fx-star');
  const list = $('#bookmarks');
  const input = $('#fx-search');
  const results = $('#fx-results');

  async function refreshStar() {
    const key = rootKey(explorer.root);
    star.hidden = !key;
    const marked = (await getBookmarks()).some((b) => b.key === key);
    star.textContent = marked ? '★' : '☆';
    star.title = marked ? 'Remove folder bookmark' : 'Bookmark this folder';
    star.classList.toggle('on', marked);
  }

  // Keep the star and search in sync with the explorer root.
  const setRoot = explorer.setRoot.bind(explorer);
  explorer.setRoot = async (...args) => {
    const r = await setRoot(...args);
    refreshStar();
    input.hidden = !explorer.root;
    if (input.value) runSearch();
    return r;
  };

  async function toggleBookmark() {
    const root = explorer.root;
    if (!root) return;
    const key = rootKey(root);
    let marks = await getBookmarks();
    if (marks.some((b) => b.key === key)) {
      marks = marks.filter((b) => b.key !== key);
      toast('Bookmark removed');
    } else {
      marks.push(root.type === 'url' ? { key, name: rootName(root), type: 'url', url: root.url, path: decodeURIComponent(new URL(root.url).pathname) } : { key, name: rootName(root), type: 'handle', id: root.id, path: root.handle.name });
      toast(t('Bookmarked “{name}”', { name: rootName(root) }));
    }
    await setBookmarks(marks);
    refreshStar();
    if (!list.hidden) renderList();
  }

  async function renderList() {
    const marks = await getBookmarks();
    list.innerHTML = marks.length
      ? marks.map((b, i) => `<div class="bm-row" data-i="${i}" title="${escapeHtml(b.path)}"><span class="bm-star">★</span><span class="bm-name">${escapeHtml(b.name)}</span><span class="bm-path">${escapeHtml(b.path)}</span><button class="icon-btn small" data-del="${i}" title="Remove">✕</button></div>`).join('')
      : '<div class="empty-hint">No bookmarks yet. Open a folder and click ☆.</div>';
  }

  list.addEventListener('click', async (e) => {
    const marks = await getBookmarks();
    const del = e.target.closest('[data-del]');
    if (del) {
      marks.splice(+del.dataset.del, 1);
      await setBookmarks(marks);
      renderList();
      refreshStar();
      return;
    }
    const row = e.target.closest('.bm-row');
    if (!row) return;
    const b = marks[+row.dataset.i];
    list.hidden = true;
    if (b.type === 'url') return explorer.setRoot({ type: 'url', url: b.url });
    const rec = await db.get('handles', b.id);
    if (!rec) return toast('That folder is no longer available', 'error');
    if ((await rec.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
    explorer.setRoot({ type: 'handle', handle: rec.handle, id: b.id });
  });

  let controller;
  let timer;
  async function runSearch() {
    controller?.abort();
    const q = input.value.trim();
    if (q.length < 2 || !explorer.root) {
      results.hidden = true;
      $('#explorer').hidden = false;
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    results.hidden = false;
    $('#explorer').hidden = true;
    results.innerHTML = '<div class="fx-searching">Searching…</div>';
    let hits = 0;
    const mark = (line, at) => {
      const start = Math.max(0, at - 30);
      return escapeHtml((start ? '…' : '') + line.slice(start, at)) + '<mark>' + escapeHtml(line.slice(at, at + q.length)) + '</mark>' + escapeHtml(line.slice(at + q.length, at + q.length + 60));
    };
    const scanned = await explorer.search(q, (file, matches, count) => {
      if (signal.aborted) return;
      if (!hits) results.innerHTML = '';
      hits++;
      const div = document.createElement('div');
      div.className = 'sr-file';
      div.innerHTML = `<a class="sr-name" href="${file.href}" title="${escapeHtml(file.path)}">${escapeHtml(file.path)}<span class="sr-count">${count || ''}</span></a>` +
        matches.map((m) => `<a class="sr-line" href="${file.href}"><span class="ln">${m.line}</span>${mark(m.text, m.at)}</a>`).join('');
      results.append(div);
    }, signal);
    if (signal.aborted) return;
    if (!hits) results.innerHTML = `<div class="empty-hint">${t('No matches in {n} files', { n: scanned })}</div>`;
    else results.insertAdjacentHTML('afterbegin', `<div class="fx-searching">${t('{n} files · {m} searched', { n: hits, m: scanned })}</div>`);
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; runSearch(); }
  });
  results.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    openAt(a.href, input.value.trim(), e.metaKey || e.ctrlKey);
  });

  return {
    toggleBookmark,
    toggleList: async () => {
      showFiles();
      list.hidden = !list.hidden;
      if (!list.hidden) renderList();
    },
    refreshStar,
  };
}
