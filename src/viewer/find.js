// Find-in-document bar using the CSS Custom Highlight API (no DOM mutation, so it
// works over the rendered view and the WYSIWYG editor alike).
import { buildIndex, rangeFromOffsets, scrollRangeIntoView, supportsHighlights } from './textindex.js';

export class FindBar {
  constructor({ el, getRoot, getScroller, getTextarea }) {
    this.el = el;
    this.getRoot = getRoot;
    this.getScroller = getScroller;
    this.getTextarea = getTextarea;
    this.input = el.querySelector('input[type="search"]');
    this.count = el.querySelector('.find-count');
    this.caseBtn = el.querySelector('[data-act="case"]');
    this.wordBtn = el.querySelector('[data-act="word"]');
    this.regexBtn = el.querySelector('[data-act="regex"]');
    this.matches = [];
    this.current = -1;
    this.opts = { caseSensitive: false, word: false, regex: false };

    this.input.addEventListener('input', () => this.search(true));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    el.querySelector('[data-act="prev"]').addEventListener('click', () => this.step(-1));
    el.querySelector('[data-act="next"]').addEventListener('click', () => this.step(1));
    el.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
    for (const [btn, key] of [[this.caseBtn, 'caseSensitive'], [this.wordBtn, 'word'], [this.regexBtn, 'regex']]) {
      btn.addEventListener('click', () => {
        this.opts[key] = !this.opts[key];
        btn.classList.toggle('on', this.opts[key]);
        this.search(true);
      });
    }
  }

  get isOpen() { return !this.el.hidden; }

  open() {
    this.el.hidden = false;
    const sel = String(window.getSelection() || '').trim();
    if (sel && !sel.includes('\n') && sel.length < 200) this.input.value = sel;
    this.input.focus();
    this.input.select();
    this.search(true);
  }

  close() {
    this.el.hidden = true;
    this.clear();
    this.getTextarea()?.focus?.();
  }

  clear() {
    if (supportsHighlights) { CSS.highlights.delete('find'); CSS.highlights.delete('find-current'); }
    this.matches = [];
    this.current = -1;
    this.count.textContent = '';
  }

  pattern() {
    const q = this.input.value;
    if (!q) return null;
    let src = this.opts.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (this.opts.word) src = `\\b(?:${src})\\b`;
    try {
      return new RegExp(src, this.opts.caseSensitive ? 'g' : 'gi');
    } catch {
      return null;
    }
  }

  // Re-run after the document changes, keeping position when possible.
  refresh() {
    if (this.isOpen) this.search(false);
  }

  search(jump) {
    this.clear();
    const re = this.pattern();
    if (!re) { this.el.classList.toggle('invalid', !!this.input.value && this.opts.regex); return; }
    this.el.classList.remove('invalid');
    const ta = this.getTextarea();
    const text = ta ? ta.value : (this.index = buildIndex(this.getRoot())).text;
    for (let m = re.exec(text); m && this.matches.length < 5000; m = re.exec(text)) {
      if (!m[0].length) { re.lastIndex++; continue; }
      this.matches.push([m.index, m.index + m[0].length]);
    }
    if (!this.matches.length) { this.count.textContent = 'No results'; return; }
    if (!ta && supportsHighlights) {
      this.ranges = this.matches.map(([s, e]) => rangeFromOffsets(this.index, s, e));
      CSS.highlights.set('find', new Highlight(...this.ranges));
    }
    // Start at the first match after the current viewport top.
    this.current = 0;
    if (!ta && this.ranges) {
      const top = this.getScroller().getBoundingClientRect().top;
      const i = this.ranges.findIndex((r) => r.getBoundingClientRect().bottom >= top);
      this.current = i < 0 ? 0 : i;
    }
    this.show(jump);
  }

  step(dir) {
    if (!this.matches.length) return this.search(true);
    this.current = (this.current + dir + this.matches.length) % this.matches.length;
    this.show(true);
  }

  show(jump) {
    this.count.textContent = `${this.current + 1} / ${this.matches.length}${this.matches.length >= 5000 ? '+' : ''}`;
    const ta = this.getTextarea();
    if (ta) {
      const [s, e] = this.matches[this.current];
      if (jump) {
        ta.setSelectionRange(s, e);
        const line = ta.value.slice(0, s).split('\n').length;
        const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
        ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 3);
      }
      return;
    }
    const r = this.ranges?.[this.current];
    if (!r) return;
    if (supportsHighlights) CSS.highlights.set('find-current', new Highlight(r));
    if (jump) scrollRangeIntoView(r, this.getScroller(), false);
  }
}
