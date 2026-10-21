// Mind map of the document's heading/list structure (markmap), exportable as SVG/PNG/JPEG.
import { FRONT_MATTER } from './render.js';
import { svgToBlob } from './svgimage.js';

let overlay;
let mm;

function build() {
  overlay = document.createElement('div');
  overlay.className = 'fullview mindmap-view';
  overlay.innerHTML = `<div class="fullview-bar"><b>Mind map</b><span class="spacer"></span>
      <button class="btn small" data-mm="expand">Expand all</button>
      <button class="btn small" data-mm="collapse">Collapse</button>
      <button class="btn small" data-mm="fit" title="Fit to Screen (F)">Fit</button>
      <span class="sep"></span>
      <button class="btn small" data-mm="zoom-out" title="Zoom Out (-)">−</button><button class="btn small" data-mm="zoom-in" title="Zoom In (+)">+</button>
      <button class="btn small" data-mm="download" title="Download (D)">Download</button>
      <button class="btn small ghost" data-mm="help" title="Help (?)">?</button>
      <button class="icon-btn" data-mm="close" title="Close (Esc)">✕</button></div>
    <svg class="mindmap-svg"></svg>`;
  document.body.append(overlay);
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mm]');
    if (b) act(b.dataset.mm);
  });
  window.addEventListener('resize', () => !overlay.hidden && mm?.fit());
  window.addEventListener('keydown', (e) => {
    if (overlay.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'Escape') { handled(); return overlay.querySelector('.mm-modal') ? overlay.querySelector('.mm-modal').remove() : close(); }
    if (k === '+' || k === '=') { handled(); return mm.rescale(1.25); }
    if (k === '-') { handled(); return mm.rescale(0.8); }
    if (k === 'f' || k === 'F') { handled(); return mm.fit(); }
    if (k === '0') { handled(); return act('expand'); }
    if (/^[1-6]$/.test(k)) { handled(); return collapseTo(+k); }
    if (k === 'd' || k === 'D') { handled(); return downloadDialog(); }
    if (k === '?') { handled(); return helpDialog(); }
  }, true);
}

async function collapseTo(depth) {
  const walk = (node, d) => {
    node.payload = { ...(node.payload || {}), fold: d >= depth && node.children?.length ? 1 : 0 };
    node.children?.forEach((c) => walk(c, d + 1));
  };
  walk(mm.state.data, 1);
  await mm.renderData();
  mm.fit();
}

function modalBox(html) {
  overlay.querySelector('.mm-modal')?.remove();
  const m = document.createElement('div');
  m.className = 'mm-modal present-help';
  m.innerHTML = `<div>${html}</div>`;
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
  overlay.append(m);
  return m;
}

function helpDialog() {
  const rows = [['+ / −', 'Zoom in / Zoom out'], ['F', 'Fit to screen'], ['0', 'Expand all nodes'], ['1–6', 'Collapse to depth N (1–6)'], ['D', 'Open download modal'], ['?', 'Show / hide this help'], ['Esc', 'Close mind map']];
  modalBox(`<h3 style="margin-top:0">Mind Map Keyboard Shortcuts</h3><table>${rows.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table>`);
}

function downloadDialog() {
  const m = modalBox(`<h3 style="margin-top:0">Download Mind Map</h3><p class="hint">Export as PNG, SVG, or JPEG</p>
    <p><b>Format</b><br><span class="segment mm-format"><button data-f="png" class="on">PNG</button><button data-f="svg">SVG</button><button data-f="jpeg">JPEG</button></span></p>
    <p><b>Scale</b><br><span class="segment mm-scale"><button data-s="1">1×</button><button data-s="2" class="on">2×</button><button data-s="3">3×</button><button data-s="4">4×</button></span></p>
    <p class="hint">PNG/JPEG exports simplified text only. Use SVG for full formatting.</p>
    <div class="row"><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" data-go>Download</button></div>`);
  m.addEventListener('click', (e) => {
    const seg = e.target.closest('.segment button');
    if (seg) { seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === seg)); return; }
    if (e.target.closest('[data-go]')) {
      const f = m.querySelector('.mm-format .on').dataset.f;
      const scale = +m.querySelector('.mm-scale .on').dataset.s;
      m.remove();
      act(f, scale);
    }
  });
}

function setFold(node, fold) {
  node.payload = { ...(node.payload || {}), fold: fold ? 1 : 0 };
  node.children?.forEach((c) => setFold(c, fold));
}

async function act(a, scale = 2) {
  if (a === 'close') return close();
  if (a === 'fit') return mm.fit();
  if (a === 'zoom-in') return mm.rescale(1.25);
  if (a === 'zoom-out') return mm.rescale(0.8);
  if (a === 'download') return downloadDialog();
  if (a === 'help') return helpDialog();
  if (a === 'expand' || a === 'collapse') {
    const root = mm.state.data;
    setFold(root, a === 'collapse');
    if (a === 'collapse') root.payload.fold = 0;
    await mm.renderData();
    return mm.fit();
  }
  const svg = overlay.querySelector('svg');
  const name = (overlay.dataset.name || 'mindmap').replace(/\.\w+$/, '');
  let blob;
  if (a === 'svg') blob = new Blob([serialize(svg)], { type: 'image/svg+xml' });
  else blob = await svgToBlob(serialize(svg), `image/${a}`, scale, a === 'jpeg' ? getComputedStyle(document.body).getPropertyValue('--bg') || '#fff' : null);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name}.${a === 'jpeg' ? 'jpg' : a}`;
  link.click();
}

// Standalone SVG with its computed size and the markmap styles inlined.
function serialize(svg) {
  const clone = svg.cloneNode(true);
  const box = svg.querySelector('g').getBBox();
  const pad = 20;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`);
  clone.setAttribute('width', box.width + pad * 2);
  clone.setAttribute('height', box.height + pad * 2);
  clone.querySelector('g').removeAttribute('transform');
  clone.style.color = getComputedStyle(svg).color;
  // foreignObject labels can't be rasterized; swap them for SVG text.
  for (const fo of clone.querySelectorAll('foreignObject')) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', fo.getAttribute('x') || 0);
    t.setAttribute('y', (+fo.getAttribute('y') || 0) + (+fo.getAttribute('height') || 16) * 0.75);
    t.setAttribute('font-size', '14');
    t.setAttribute('font-family', 'sans-serif');
    t.setAttribute('fill', 'currentColor');
    t.textContent = fo.textContent;
    fo.replaceWith(t);
  }
  return new XMLSerializer().serializeToString(clone);
}

function close() {
  overlay.hidden = true;
}

export async function openMindMap(markdown, name) {
  if (!overlay) build();
  overlay.hidden = false;
  overlay.dataset.name = name;
  const [{ Transformer }, { Markmap }] = await Promise.all([import('markmap-lib/no-plugins'), import('markmap-view')]);
  const text = markdown.replace(FRONT_MATTER, '');
  const { root } = new Transformer().transform(text);
  const svg = overlay.querySelector('svg');
  if (!mm) mm = Markmap.create(svg, { initialExpandLevel: 3, duration: 300, maxWidth: 320 });
  await mm.setData(root);
  await mm.fit();
}
