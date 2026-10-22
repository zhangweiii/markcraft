// Diagram code blocks → SVG. Each renderer is loaded on first use.
import { escapeHtml } from './render.js';
import { t } from '../shared/i18n.js';

export const DIAGRAM_LANGS = {
  mermaid: 'mermaid',
  dot: 'graphviz',
  graphviz: 'graphviz',
  gv: 'graphviz',
  wavedrom: 'wavedrom',
  plantuml: 'plantuml',
  puml: 'plantuml',
};

// Mermaid's `base` theme tuned to the document palette (content.css).
const MERMAID_THEME = {
  light: {
    background: '#fbfbf9', mainBkg: '#eef1f7', nodeBorder: '#a9b6cf', primaryColor: '#eef1f7', primaryBorderColor: '#a9b6cf', primaryTextColor: '#2b2c30',
    secondaryColor: '#eef5ef', secondaryBorderColor: '#a9c9b2', tertiaryColor: '#f3f3f0', tertiaryBorderColor: '#e0dfdb',
    lineColor: '#8d9099', textColor: '#45474d', edgeLabelBackground: '#fbfbf9', clusterBkg: '#f6f6f3', clusterBorder: '#e0dfdb',
    noteBkgColor: '#faf2d6', noteBorderColor: '#e4d39a', noteTextColor: '#45474d',
  },
  dark: {
    darkMode: true, background: '#1c1d20', mainBkg: '#262a33', nodeBorder: '#4c5466', primaryColor: '#262a33', primaryBorderColor: '#4c5466', primaryTextColor: '#d6d6da',
    secondaryColor: '#22302a', secondaryBorderColor: '#4a7a5c', tertiaryColor: '#242528', tertiaryBorderColor: '#3a3b40',
    lineColor: '#7d8089', textColor: '#c4c5ca', edgeLabelBackground: '#1c1d20', clusterBkg: '#212225', clusterBorder: '#3a3b40',
    noteBkgColor: '#2f2b20', noteBorderColor: '#6b5d36', noteTextColor: '#d6d6da',
  },
  sepia: {
    background: '#f8f1e3', mainBkg: '#f1e6d0', nodeBorder: '#c9b48e', primaryColor: '#f1e6d0', primaryBorderColor: '#c9b48e', primaryTextColor: '#45392b',
    secondaryColor: '#e9ead2', secondaryBorderColor: '#b5b78a', tertiaryColor: '#f0e6d2', tertiaryBorderColor: '#dccfb6',
    lineColor: '#9a8a72', textColor: '#5a4a38', edgeLabelBackground: '#f8f1e3', clusterBkg: '#f2e9d7', clusterBorder: '#dccfb6',
    noteBkgColor: '#f5e6b8', noteBorderColor: '#d8c088', noteTextColor: '#45392b',
  },
};

// Exports (plain) always use the light palette.
const mermaidPalette = (dark, plain) =>
  dark ? 'dark' : !plain && document.documentElement.dataset.theme === 'sepia' ? 'sepia' : 'light';

let mermaidP;
let seq = 0;
async function mermaid(source, dark, _settings, plain = false) {
  mermaidP ||= import('mermaid').then((m) => m.default);
  const m = await mermaidP;
  m.initialize({
    startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'inherit',
    themeVariables: { fontSize: '14px', dropShadow: 'none', ...MERMAID_THEME[mermaidPalette(dark, plain)] },
    // Plain SVG text labels (no foreignObject) so the diagram can be rasterized for export.
    htmlLabels: !plain, flowchart: { htmlLabels: !plain, curve: 'basis', padding: 14 },
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
  if (!settings.plantumlConsent) {
    const host = (() => { try { return new URL(settings.plantumlServer).host; } catch { return settings.plantumlServer; } })();
    const err = new Error(`Rendering this diagram requires sending its source code to a third-party server (${host}).`);
    err.notice = true;
    err.consent = true;
    throw err;
  }
  const url = `${settings.plantumlServer.replace(/\/$/, '')}/${dark ? 'dsvg' : 'svg'}/${await plantumlEncode(source)}`;
  const res = await fetch(url);
  if (!res.ok && res.status !== 400) throw new Error(`PlantUML server: HTTP ${res.status}`);
  return res.text();
}

function reason(e) {
  const msg = String(e.message || e).split('\n')[0];
  if (e.notice) return msg;
  if (e.name === 'TypeError' && /fetch/i.test(msg)) return 'Network error - could not reach the diagram server';
  if (/timeout/i.test(msg)) return 'The diagram server did not respond in time';
  if (/HTTP 5\d\d/.test(msg)) return 'Diagram server error';
  return `Diagram source error — ${msg}`;
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
      fig.innerHTML = `<div class="diagram-error-msg${e.notice ? ' notice-msg' : ''}"><span>${escapeHtml(kind)}: ${escapeHtml(t(reason(e)))}</span>
        ${e.consent ? `<button class="btn small" data-act="plantuml-consent">${t('Enable rendering')}</button>` : `<button class="btn small" data-diag="retry">${t('Retry')}</button>`}
        <button class="btn small ghost" data-diag="source">${t('Show source')}</button></div><pre ${e.notice ? '' : 'hidden'}>${escapeHtml(source)}</pre>`;
      fig.querySelector('[data-diag="source"]').addEventListener('click', () => { const pre = fig.querySelector('pre'); pre.hidden = !pre.hidden; });
      fig.querySelector('[data-diag="retry"]')?.addEventListener('click', async () => {
        const pending = document.createElement('pre');
        pending.className = 'diagram-pending';
        pending.dataset.kind = kind;
        pending.dataset.source = source;
        fig.replaceWith(pending);
        await renderDiagrams(pending.parentElement, { dark, settings });
      });
    }
    pre.replaceWith(fig);
  }
}
