// Review loop: highlight text, attach inline comments, then hand everything off as a prompt.
import { db, uid } from '../shared/db.js';
import { buildIndex, offsetOf, rangeFromOffsets, scrollRangeIntoView, supportsHighlights } from './textindex.js';
import { escapeHtml } from './render.js';

const CTX = 48;

function commonSuffix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

export class Review {
  constructor({ listEl, countEl, composer, getRoot, getScroller, onChange }) {
    this.listEl = listEl;
    this.countEl = countEl;
    this.composer = composer;
    this.getRoot = getRoot;
    this.getScroller = getScroller;
    this.onChange = onChange;
    this.items = [];
    this.key = null;

    const ta = composer.querySelector('textarea');
    composer.querySelector('[data-act="save"]').addEventListener('click', () => this.commitComposer());
    composer.querySelector('[data-act="cancel"]').addEventListener('click', () => this.closeComposer());
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.commitComposer(); }
      if (e.key === 'Escape') { e.preventDefault(); this.closeComposer(); }
    });

    listEl.addEventListener('click', (e) => {
      const card = e.target.closest('.comment-card');
      if (!card) return;
      const item = this.items.find((i) => i.id === card.dataset.id);
      if (e.target.closest('[data-act="delete"]')) return this.remove(item.id);
      if (e.target.closest('[data-act="resolve"]')) { item.resolved = !item.resolved; this.persist(); return this.paint(); }
      if (e.target.closest('textarea')) return;
      this.focus(item.id, true);
    });
    listEl.addEventListener('input', (e) => {
      const card = e.target.closest('.comment-card');
      const item = card && this.items.find((i) => i.id === card.dataset.id);
      if (item && e.target.matches('textarea')) { item.comment = e.target.value; this.persist(); }
    });
  }

  async load(key) {
    this.key = key;
    this.items = (key && (await db.get('comments', key))) || [];
    this.paint();
  }

  persist() {
    // Strip the runtime anchoring fields (Ranges can't be stored).
    const plain = this.items.map(({ _range, _start, ...rest }) => rest);
    if (this.key) db.set('comments', this.key, plain);
    this.onChange?.(this.items);
  }

  get open() { return this.items.filter((i) => !i.resolved); }
  // Items that carry a note to hand off (plain highlights without text don't).
  get openComments() { return this.open.filter((i) => i.comment?.trim()); }

  // Capture the current selection inside the document.
  captureSelection() {
    const sel = window.getSelection();
    const root = this.getRoot();
    if (!sel || sel.isCollapsed || !root) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const index = buildIndex(root);
    const s = offsetOf(index, range.startContainer, range.startOffset);
    const e = offsetOf(index, range.endContainer, range.endOffset);
    if (s < 0 || e <= s) return null;
    const quote = index.text.slice(s, e);
    if (!quote.trim()) return null;
    return { range, draft: { quote, prefix: index.text.slice(Math.max(0, s - CTX), s), suffix: index.text.slice(e, e + CTX) } };
  }

  // kind: 'comment' (opens the composer) | 'highlight' | 'underline'
  annotate(kind = 'comment', color = 'yellow') {
    const cap = this.captureSelection();
    if (!cap) return false;
    if (kind !== 'comment') {
      this.add({ ...cap.draft, kind, color: kind === 'highlight' ? color : undefined, comment: '' });
      window.getSelection()?.removeAllRanges();
      return true;
    }
    this.draft = cap.draft;
    const rect = cap.range.getBoundingClientRect();
    this.composer.hidden = false;
    this.composer.querySelector('.composer-quote').textContent = cap.draft.quote.length > 160 ? cap.draft.quote.slice(0, 160) + '…' : cap.draft.quote;
    const ta = this.composer.querySelector('textarea');
    ta.value = '';
    const w = 320;
    this.composer.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left)) + 'px';
    const below = rect.bottom + 8;
    this.composer.style.top = (below + 180 > window.innerHeight ? Math.max(8, rect.top - 190) : below) + 'px';
    if (supportsHighlights) CSS.highlights.set('review-draft', new Highlight(cap.range.cloneRange()));
    ta.focus();
    return true;
  }

  startFromSelection() {
    return this.annotate('comment');
  }

  add(fields) {
    const item = { id: uid(), kind: 'comment', created: Date.now(), ...fields };
    this.items.push(item);
    this.persist();
    this.paint();
    this.focus(item.id, false);
    return item;
  }

  commitComposer() {
    const text = this.composer.querySelector('textarea').value.trim();
    if (!this.draft || !text) return this.closeComposer();
    const draft = this.draft;
    this.closeComposer();
    window.getSelection()?.removeAllRanges();
    this.add({ ...draft, kind: 'comment', comment: text });
  }

  closeComposer() {
    this.composer.hidden = true;
    this.draft = null;
    if (supportsHighlights) CSS.highlights.delete('review-draft');
  }

  remove(id) {
    this.items = this.items.filter((i) => i.id !== id);
    this.persist();
    this.paint();
  }

  clearAll(onlyOpen = false) {
    this.items = onlyOpen ? this.items.filter((i) => i.resolved) : [];
    this.persist();
    this.paint();
  }

  // Find where each comment's quote sits in the current rendering.
  anchor() {
    const root = this.getRoot();
    if (!root) return;
    this.index = buildIndex(root);
    const text = this.index.text;
    for (const item of this.items) {
      let best = null;
      let bestScore = -1;
      for (let i = text.indexOf(item.quote); i >= 0; i = text.indexOf(item.quote, i + 1)) {
        const score = commonSuffix(text.slice(Math.max(0, i - CTX), i), item.prefix) + commonPrefix(text.slice(i + item.quote.length, i + item.quote.length + CTX), item.suffix);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      item._range = best == null ? null : rangeFromOffsets(this.index, best, best + item.quote.length);
      item._start = best;
    }
  }

  paint() {
    this.anchor();
    if (supportsHighlights) {
      for (const name of [...CSS.highlights.keys()]) if (name === 'review' || name.startsWith('anno-')) CSS.highlights.delete(name);
      const groups = {};
      for (const i of this.items) {
        if (!i._range || i.resolved) continue;
        const name = i.kind === 'highlight' ? `anno-${i.color || 'yellow'}` : i.kind === 'underline' ? 'anno-underline' : 'review';
        (groups[name] ||= []).push(i._range);
      }
      for (const [name, ranges] of Object.entries(groups)) CSS.highlights.set(name, new Highlight(...ranges));
    }
    const open = this.open.length;
    this.countEl.textContent = open || '';
    this.countEl.hidden = !open;
    const sorted = [...this.items].sort((a, b) => (a._start ?? 1e12) - (b._start ?? 1e12));
    const label = (i) => (i.kind === 'highlight' ? `<span class="kind-chip hl-${i.color || 'yellow'}">Highlight</span>` : i.kind === 'underline' ? '<span class="kind-chip ul">Underline</span>' : '');
    this.listEl.innerHTML = sorted.length
      ? sorted
          .map(
            (i) => `<div class="comment-card kind-${i.kind || 'comment'}${i.resolved ? ' resolved' : ''}${i._range ? '' : ' orphan'}" data-id="${i.id}">
        <blockquote class="${i.kind === 'highlight' ? 'hl-' + (i.color || 'yellow') : ''}">${escapeHtml(i.quote.length > 220 ? i.quote.slice(0, 220) + '…' : i.quote)}</blockquote>
        <textarea rows="${i.comment ? 2 : 1}" spellcheck="true" placeholder="${i.kind === 'comment' ? 'Comment' : 'Add a note (optional)'}">${escapeHtml(i.comment || '')}</textarea>
        <div class="comment-meta">${label(i)}${i._range ? '' : '<span class="tag warn" title="The quoted text is no longer in the document">detached</span>'}
          <span class="time">${new Date(i.created).toLocaleString()}</span>
          <button class="link-btn" data-act="resolve">${i.resolved ? 'Reopen' : 'Resolve'}</button>
          <button class="link-btn danger" data-act="delete">Delete</button></div></div>`,
          )
          .join('')
      : '<div class="empty-hint">Select text in the document to highlight, underline or comment on it (<kbd>⌘⇧R</kbd> comments). Annotations are kept per document and appear in print and exports.</div>';
  }

  // Bake annotations into a rendered copy (for HTML/Word exports).
  applyTo(root) {
    const index = buildIndex(root);
    const text = index.text;
    for (const item of this.items) {
      if (item.resolved) continue;
      const at = text.indexOf(item.quote);
      if (at < 0) continue;
      const range = rangeFromOffsets(index, at, at + item.quote.length);
      const tag = item.kind === 'underline' ? 'u' : 'mark';
      // Wrap each text node piece separately so ranges may cross element boundaries.
      const pieces = index.nodes.filter((n) => range.intersectsNode(n.node));
      for (const { node } of pieces) {
        const s0 = node === range.startContainer ? range.startOffset : 0;
        const e0 = node === range.endContainer ? range.endOffset : node.data.length;
        if (e0 <= s0) continue;
        const r = document.createRange();
        r.setStart(node, s0);
        r.setEnd(node, e0);
        const w = document.createElement(tag);
        w.className = `anno anno-${item.kind === 'highlight' ? item.color || 'yellow' : item.kind || 'comment'}`;
        if (item.comment) w.title = item.comment;
        r.surroundContents(w);
      }
    }
  }

  focus(id, scroll) {
    const item = this.items.find((i) => i.id === id);
    this.listEl.querySelectorAll('.comment-card.active').forEach((c) => c.classList.remove('active'));
    const card = this.listEl.querySelector(`[data-id="${id}"]`);
    card?.classList.add('active');
    card?.scrollIntoView({ block: 'nearest' });
    if (item?._range && supportsHighlights) {
      CSS.highlights.set('review-active', new Highlight(item._range));
      if (scroll) scrollRangeIntoView(item._range, this.getScroller());
    }
  }

  // Click on highlighted text → focus its comment card.
  hitTest(x, y) {
    if (!this.index || !this.items.length) return null;
    const pos = document.caretPositionFromPoint?.(x, y);
    const node = pos?.offsetNode;
    if (!node) return null;
    const off = offsetOf(this.index, node, pos.offset);
    const hit = this.items.find((i) => i._range && !i.resolved && off >= i._start && off <= i._start + i.quote.length);
    if (hit) this.focus(hit.id, false);
    return hit;
  }

  buildPrompt(docPath) {
    const items = this.openComments.sort((a, b) => (a._start ?? 1e12) - (b._start ?? 1e12));
    const lines = [
      `Please revise the Markdown document \`${docPath}\` to address the review comments below.`,
      'Each comment quotes the passage it refers to. Only change what the comments ask for and keep the rest of the document intact.',
      '',
    ];
    items.forEach((i, n) => {
      const quote = i.quote.replace(/\s+/g, ' ').trim();
      lines.push(`${n + 1}. On "${quote.length > 300 ? quote.slice(0, 300) + '…' : quote}"`);
      lines.push(`   Comment: ${i.comment.replace(/\n/g, '\n   ')}`);
      lines.push('');
    });
    return lines.join('\n').trim() + '\n';
  }
}
