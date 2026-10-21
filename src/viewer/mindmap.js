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
      <button class="btn small" data-mm="fit">Fit</button>
      <span class="sep"></span>
      <button class="btn small" data-mm="svg">SVG</button><button class="btn small" data-mm="png">PNG</button><button class="btn small" data-mm="jpeg">JPEG</button>
      <button class="icon-btn" data-mm="close" title="Close (Esc)">✕</button></div>
    <svg class="mindmap-svg"></svg>`;
  document.body.append(overlay);
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mm]');
    if (b) act(b.dataset.mm);
  });
  window.addEventListener('resize', () => !overlay.hidden && mm?.fit());
  window.addEventListener('keydown', (e) => {
    if (!overlay.hidden && e.key === 'Escape') { e.stopPropagation(); close(); }
  }, true);
}

function setFold(node, fold) {
  node.payload = { ...(node.payload || {}), fold: fold ? 1 : 0 };
  node.children?.forEach((c) => setFold(c, fold));
}

async function act(a) {
  if (a === 'close') return close();
  if (a === 'fit') return mm.fit();
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
  else blob = await svgToBlob(serialize(svg), `image/${a}`, 2, a === 'jpeg' ? getComputedStyle(document.body).getPropertyValue('--bg') || '#fff' : null);
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
