// Diagram code blocks → SVG. Each renderer is loaded on first use.
import { escapeHtml } from './render.js';

export const DIAGRAM_LANGS = {
  mermaid: 'mermaid',
  dot: 'graphviz',
  graphviz: 'graphviz',
  gv: 'graphviz',
  wavedrom: 'wavedrom',
  plantuml: 'plantuml',
  puml: 'plantuml',
};

let mermaidP;
let seq = 0;
async function mermaid(source, dark, _settings, plain = false) {
  mermaidP ||= import('mermaid').then((m) => m.default);
  const m = await mermaidP;
  m.initialize({
    startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'inherit',
    // Plain SVG text labels (no foreignObject) so the diagram can be rasterized for export.
    htmlLabels: !plain, flowchart: { htmlLabels: !plain },
  });
  const id = 'mermaid-' + ++seq;
  try {
    return (await m.render(id, source)).svg;
  } finally {
    document.getElementById('d' + id)?.remove();
  }
}

let vizP;
async function graphviz(source) {
  vizP ||= import('@viz-js/viz').then((m) => m.instance());
  const viz = await vizP;
  const res = viz.render(source, { format: 'svg' });
  if (res.status !== 'success') throw new Error(res.errors.map((e) => e.message).join('; ') || 'Graphviz error');
  return res.output;
}

let waveP;
async function wavedrom(source, dark) {
  waveP ||= Promise.all([import('wavedrom'), import('wavedrom/skins/default.js'), import('wavedrom/skins/dark.js'), import('json5')]);
  const [wd, light, darkSkin, JSON5] = (await waveP).map((m) => m.default || m);
  const { renderAny, onml: { stringify } } = wd;
  const obj = JSON5.parse(source);
  const skins = { ...light, ...darkSkin };
  if (dark && obj.signal) obj.config = { skin: 'dark', ...(obj.config || {}) };
  return stringify(renderAny(++seq, obj, skins));
}

// PlantUML text encoding: deflate + custom base64 alphabet.
async function plantumlEncode(text) {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;
    out += alphabet[b1 >> 2] + alphabet[((b1 & 3) << 4) | (b2 >> 4)] + alphabet[((b2 & 15) << 2) | (b3 >> 6)] + alphabet[b3 & 63];
  }
  return out;
}

async function plantuml(source, dark, settings) {
  if (!settings.plantumlServer) {
    const err = new Error('PlantUML needs a rendering server. Turn it on in Settings → Rendering (sends the diagram source to that server).');
    err.notice = true;
    throw err;
  }
  const url = `${settings.plantumlServer.replace(/\/$/, '')}/${dark ? 'dsvg' : 'svg'}/${await plantumlEncode(source)}`;
  const res = await fetch(url);
  if (!res.ok && res.status !== 400) throw new Error(`PlantUML server: HTTP ${res.status}`);
  return res.text();
}

const RENDERERS = { mermaid, graphviz, wavedrom, plantuml };

export const mermaidPlain = (source) => mermaid(source, false, null, true);

export async function renderDiagram(kind, source, { dark, settings }) {
  return RENDERERS[kind](source, dark, settings);
}

// Replace pending diagram placeholders inside root.
export async function renderDiagrams(root, { dark, settings }) {
  for (const pre of [...root.querySelectorAll('pre.diagram-pending')]) {
    const kind = pre.dataset.kind;
    const source = pre.dataset.source;
    const fig = document.createElement('div');
    fig.className = `diagram ${kind}-diagram`;
    fig.dataset.kind = kind;
    fig.dataset.source = source;
    try {
      const svg = await renderDiagram(kind, source, { dark, settings });
      // Server-provided / generated SVG: strip scripts and event handlers defensively.
      fig.innerHTML = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
    } catch (e) {
      fig.classList.add('diagram-error');
      fig.innerHTML = `<div class="diagram-error-msg${e.notice ? ' notice-msg' : ''}">${escapeHtml(kind)}: ${escapeHtml(String(e.message || e).split('\n')[0])}</div><pre>${escapeHtml(source)}</pre>`;
    }
    pre.replaceWith(fig);
  }
}
