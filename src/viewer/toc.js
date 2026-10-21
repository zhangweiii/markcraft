// Outline sidebar generated from the headings of the active view, with scroll-spy.
import { escapeHtml } from './render.js';

export class Outline {
  constructor({ el, filter, getRoot, getScroller }) {
    this.el = el;
    this.filter = filter;
    this.getRoot = getRoot;
    this.getScroller = getScroller;
    this.items = [];
    this.collapsed = new Set();
    filter.addEventListener('input', () => this.applyFilter());
    el.addEventListener('click', (e) => {
      const twist = e.target.closest('.toc-twist');
      const item = e.target.closest('.toc-item');
      if (!item) return;
      const i = +item.dataset.i;
      if (twist) {
        this.collapsed.has(i) ? this.collapsed.delete(i) : this.collapsed.add(i);
        this.applyFilter();
        return;
      }
      this.scrollTo(i);
    });
    this.onScroll = () => {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => this.spy());
    };
  }

  build() {
    const root = this.getRoot();
    const scroller = this.getScroller();
    if (this.scroller !== scroller) {
      this.scroller?.removeEventListener('scroll', this.onScroll);
      scroller.addEventListener('scroll', this.onScroll, { passive: true });
      this.scroller = scroller;
    }
    const heads = root ? [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => h.textContent.trim()) : [];
    const sig = heads.map((h) => h.tagName + h.textContent).join('\u0000');
    this.heads = heads;
    if (sig === this.sig) return this.spy();
    this.sig = sig;
    const min = Math.min(...heads.map((h) => +h.tagName[1]));
    this.items = heads.map((h, i) => ({ i, level: +h.tagName[1] - min, text: h.textContent.trim() }));
    this.items.forEach((it, i) => (it.hasChildren = this.items[i + 1]?.level > it.level));
    this.el.innerHTML = this.items.length
      ? this.items
          .map(
            (it) =>
              `<div class="toc-item lvl-${it.level}" data-i="${it.i}" style="--lvl:${it.level}" title="${escapeHtml(it.text)}">` +
              `<span class="toc-twist${it.hasChildren ? '' : ' leaf'}"></span><span class="toc-text">${escapeHtml(it.text)}</span></div>`,
          )
          .join('')
      : '<div class="empty-hint">No headings</div>';
    this.applyFilter();
    this.spy();
  }

  applyFilter() {
    const q = this.filter.value.trim().toLowerCase();
    let hideBelow = Infinity;
    for (const it of this.items) {
      const node = this.el.children[it.i];
      if (!node) continue;
      if (it.level <= hideBelow) hideBelow = Infinity;
      const hiddenByCollapse = it.level > hideBelow;
      if (!hiddenByCollapse && this.collapsed.has(it.i)) hideBelow = it.level;
      node.classList.toggle('collapsed', this.collapsed.has(it.i));
      node.hidden = q ? !it.text.toLowerCase().includes(q) : hiddenByCollapse;
    }
  }

  scrollTo(i) {
    const h = this.heads?.[i];
    if (!h) return;
    const scroller = this.getScroller();
    const top = scroller.scrollTop + h.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12;
    scroller.scrollTo({ top, behavior: 'smooth' });
    h.classList.add('flash');
    setTimeout(() => h.classList.remove('flash'), 1200);
  }

  spy() {
    if (!this.heads?.length) return;
    const top = this.getScroller().getBoundingClientRect().top + 80;
    let active = 0;
    for (let i = 0; i < this.heads.length; i++) {
      if (this.heads[i].getBoundingClientRect().top <= top) active = i;
      else break;
    }
    if (active === this.active) return;
    this.active = active;
    this.el.querySelector('.toc-item.active')?.classList.remove('active');
    const node = this.el.children[active];
    if (node) {
      node.classList.add('active');
      const r = node.getBoundingClientRect();
      const b = this.el.getBoundingClientRect();
      if (r.top < b.top || r.bottom > b.bottom) node.scrollIntoView({ block: 'nearest' });
    }
  }

  // Heading index currently at the top of the viewport (used to keep position across mode switches).
  currentHeading() {
    return this.active ?? 0;
  }
}
