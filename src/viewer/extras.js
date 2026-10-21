// Reading aids: statistics, progress, image lightbox, zoomable diagrams.
import { t } from '../shared/i18n.js';
import { icon } from '../shared/icons.js';
import { svgToBlob, svgElementText } from './svgimage.js';

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;

export function textStats(text) {
  const cjk = (text.match(CJK) || []).length;
  const words = (text.replace(CJK, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
  const chars = text.replace(/\s/g, '').length;
  const minutes = words / 230 + cjk / 450;
  return { words: words + cjk, chars, minutes };
}

export function formatStats({ words, chars, minutes }) {
  const n = (x) => x.toLocaleString();
  const read = minutes < 1 ? t('< 1 min read') : t('{m} min read', { m: Math.round(minutes) });
  return t('{n} words · {c} characters · {m}', { n: n(words), c: n(chars), m: read });
}

// Pan/zoom overlay used for images (with gallery) and diagrams.
export class Zoomer {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'zoomer';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="zoomer-stage"></div>
      <div class="zoomer-bar">
        <button data-z="prev" title="Previous (←)">‹</button><span class="zoomer-count"></span><button data-z="next" title="Next (→)">›</button>
        <span class="zoomer-sep"></span>
        <button data-z="out" title="Zoom out (−)">−</button><button data-z="fit" title="Fit (0)">Fit</button><button data-z="in" title="Zoom in (+)">+</button>
        <button data-z="download" title="Download">⤓</button><button data-z="close" title="Close (Esc)">✕</button>
      </div><div class="zoomer-caption"></div>`;
    document.body.append(this.el);
    this.stage = this.el.querySelector('.zoomer-stage');
    this.scale = 1;
    this.x = 0;
    this.y = 0;

    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-z]');
      if (b) return this.act(b.dataset.z);
      if (e.target === this.el || e.target === this.stage) this.close();
    });
    this.stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
      this.zoomAt(factor, e.clientX, e.clientY);
    }, { passive: false });
    this.stage.addEventListener('pointerdown', (e) => {
      if (!this.content) return;
      e.preventDefault();
      this.stage.setPointerCapture(e.pointerId);
      const sx = e.clientX - this.x;
      const sy = e.clientY - this.y;
      this.stage.classList.add('dragging');
      const move = (ev) => { this.x = ev.clientX - sx; this.y = ev.clientY - sy; this.apply(); };
      this.stage.addEventListener('pointermove', move);
      this.stage.addEventListener('pointerup', () => { this.stage.removeEventListener('pointermove', move); this.stage.classList.remove('dragging'); }, { once: true });
    });
    this.stage.addEventListener('dblclick', (e) => (this.scale > this.fitScale * 1.05 ? this.fit() : this.zoomAt(2, e.clientX, e.clientY)));
    window.addEventListener('keydown', (e) => {
      if (this.el.hidden) return;
      const map = { Escape: 'close', ArrowLeft: 'prev', ArrowRight: 'next', '+': 'in', '=': 'in', '-': 'out', 0: 'fit' };
      if (map[e.key]) { e.preventDefault(); e.stopPropagation(); this.act(map[e.key]); }
    }, true);
  }

  // items: [{ kind: 'img', src, caption } | { kind: 'svg', node, caption, name }]
  open(items, index = 0) {
    this.items = items;
    this.index = index;
    this.el.hidden = false;
    this.el.classList.toggle('single', items.length < 2);
    this.show();
  }

  close() {
    this.el.hidden = true;
    this.stage.innerHTML = '';
    this.content = null;
  }

  act(a) {
    if (a === 'close') this.close();
    if (a === 'prev' && this.items.length > 1) { this.index = (this.index - 1 + this.items.length) % this.items.length; this.show(); }
    if (a === 'next' && this.items.length > 1) { this.index = (this.index + 1) % this.items.length; this.show(); }
    if (a === 'in') this.zoomAt(1.25);
    if (a === 'out') this.zoomAt(0.8);
    if (a === 'fit') this.fit();
    if (a === 'download') this.download();
  }

  show() {
    const item = this.items[this.index];
    this.stage.innerHTML = '';
    let node;
    if (item.kind === 'img') {
      node = new Image();
      node.src = item.src;
      node.draggable = false;
      node.onload = () => this.fit();
    } else {
      node = item.node.cloneNode(true);
      node.removeAttribute('style');
      node.style.maxWidth = 'none';
      requestAnimationFrame(() => this.fit());
    }
    node.classList.add('zoomer-content');
    this.stage.append(node);
    this.content = node;
    this.el.querySelector('.zoomer-count').textContent = `${this.index + 1} / ${this.items.length}`;
    this.el.querySelector('.zoomer-caption').textContent = item.caption || '';
  }

  naturalSize() {
    const c = this.content;
    if (c instanceof HTMLImageElement) return { w: c.naturalWidth || 1, h: c.naturalHeight || 1 };
    const vb = c.viewBox?.baseVal;
    if (vb && vb.width) return { w: vb.width, h: vb.height };
    const r = c.getBoundingClientRect();
    return { w: r.width / this.scale || 1, h: r.height / this.scale || 1 };
  }

  fit() {
    if (!this.content) return;
    const { w, h } = this.naturalSize();
    this.content.style.width = w + 'px';
    this.content.style.height = h + 'px';
    const box = this.stage.getBoundingClientRect();
    this.fitScale = Math.min((box.width - 40) / w, (box.height - 40) / h, this.content instanceof HTMLImageElement ? 1 : 4);
    this.scale = this.fitScale;
    this.x = (box.width - w * this.scale) / 2;
    this.y = (box.height - h * this.scale) / 2;
    this.apply();
  }

  zoomAt(factor, cx, cy) {
    const box = this.stage.getBoundingClientRect();
    cx = (cx ?? box.left + box.width / 2) - box.left;
    cy = (cy ?? box.top + box.height / 2) - box.top;
    const next = Math.max(0.05, Math.min(40, this.scale * factor));
    const k = next / this.scale;
    this.x = cx - (cx - this.x) * k;
    this.y = cy - (cy - this.y) * k;
    this.scale = next;
    this.apply();
  }

  apply() {
    if (this.content) this.content.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
  }

  download() {
    const item = this.items[this.index];
    if (item.kind !== 'img') return downloadDiagram(item.fig || item.node.parentElement);
    const a = document.createElement('a');
    a.href = item.src;
    a.download = item.src.split('/').pop().split('?')[0] || 'image';
    a.click();
  }
}

// Wire click handlers inside the rendered document.
export function attachZoom(root, zoomer) {
  const imgs = [...root.querySelectorAll('img')].filter((i) => !i.closest('a') && !i.classList.contains('broken'));
  imgs.forEach((img, i) => {
    img.classList.add('zoomable');
    img.loading = 'lazy';
    img.addEventListener('click', () => zoomer.open(imgs.map((x) => ({ kind: 'img', src: x.currentSrc || x.src, caption: x.alt || x.title })), i));
  });
  for (const fig of root.querySelectorAll('.diagram')) {
    const svg = fig.querySelector(':scope > svg');
    if (!svg || fig.querySelector('.diagram-tools')) continue;
    const tools = document.createElement('div');
    tools.className = 'diagram-tools';
    tools.setAttribute('data-noindex', '');
    tools.innerHTML = `<button class="diagram-zoom" title="${t('Fullscreen (zoom & pan)')}">${icon('fullscreen', 15)}</button><button class="diagram-dl" title="${t('Download')}">${icon('download', 15)}</button>`;
    tools.querySelector('.diagram-zoom').addEventListener('click', () => zoomer.open([{ kind: 'svg', node: svg, caption: fig.dataset.kind, name: fig.dataset.kind, fig }]));
    tools.querySelector('.diagram-dl').addEventListener('click', () => downloadDiagram(fig));
    fig.append(tools);
    fig.addEventListener('dblclick', () => tools.querySelector('.diagram-zoom').click());
  }
}

// Download a rendered diagram as SVG, PNG or JPEG at a chosen scale.
export function downloadDiagram(fig) {
  const svg = fig.querySelector(':scope > svg');
  if (!svg) return;
  const kind = fig.dataset.kind || 'diagram';
  const box = document.createElement('div');
  box.className = 'dl-modal';
  box.innerHTML = `<div class="dl-card"><h3>${t('Download Diagram')}</h3><p class="hint">${t('Export as PNG, SVG, or JPEG')}</p>
    <div class="dl-row"><b>${t('Format')}</b><span class="segment" data-g="f"><button data-v="svg" class="on">SVG</button><button data-v="png">PNG</button><button data-v="jpeg">JPEG</button></span></div>
    <div class="dl-row"><b>${t('Scale')}</b><span class="segment" data-g="s"><button data-v="1">1×</button><button data-v="2" class="on">2×</button><button data-v="3">3×</button><button data-v="4">4×</button></span></div>
    <p class="hint">${t('PNG/JPEG quality depends on scale. Use SVG for lossless vector output.')}</p>
    <div class="row"><span class="spacer"></span><button class="btn" data-x>${t('Cancel')}</button><button class="btn primary" data-go>${t('Download')}</button></div></div>`;
  document.body.append(box);
  const close = () => box.remove();
  box.addEventListener('click', async (e) => {
    if (e.target === box || e.target.closest('[data-x]')) return close();
    const seg = e.target.closest('.segment button');
    if (seg) return seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === seg));
    if (!e.target.closest('[data-go]')) return;
    const fmt = box.querySelector('[data-g="f"] .on').dataset.v;
    const scale = +box.querySelector('[data-g="s"] .on').dataset.v;
    close();
    let { text } = svgElementText(svg);
    let blob;
    if (fmt === 'svg') blob = new Blob([text], { type: 'image/svg+xml' });
    else {
      // HTML labels (foreignObject) can't be rasterized; re-render Mermaid with SVG text labels.
      if (kind === 'mermaid' && svg.querySelector('foreignObject')) {
        const { mermaidPlain } = await import('./diagrams.js');
        text = await mermaidPlain(fig.dataset.source);
      }
      blob = await svgToBlob(text, `image/${fmt}`, scale, fmt === 'jpeg' ? '#ffffff' : null);
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}.${fmt === 'jpeg' ? 'jpg' : fmt}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}
