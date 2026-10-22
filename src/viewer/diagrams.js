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
    background: '#ffffff', mainBkg: '#f3f3fe', nodeBorder: '#a9aaf2', primaryColor: '#f3f3fe', primaryBorderColor: '#a9aaf2', primaryTextColor: '#1d1e24',
    secondaryColor: '#f1f8f4', secondaryBorderColor: '#9fd2b4', tertiaryColor: '#f7f7f9', tertiaryBorderColor: '#dcdde3',
    lineColor: '#8b8d9b', textColor: '#3d3f4a', edgeLabelBackground: '#ffffff', clusterBkg: '#fafafb', clusterBorder: '#dcdde3',
    noteBkgColor: '#fff8db', noteBorderColor: '#ecd690', noteTextColor: '#3d3f4a',
  },
  dark: {
    darkMode: true, background: '#141419', mainBkg: '#202036', nodeBorder: '#5b5cc8', primaryColor: '#202036', primaryBorderColor: '#5b5cc8', primaryTextColor: '#e6e6ee',
    secondaryColor: '#18281f', secondaryBorderColor: '#3f8a5f', tertiaryColor: '#1b1b22', tertiaryBorderColor: '#33333e',
    lineColor: '#7c7c8e', textColor: '#c9c9d4', edgeLabelBackground: '#141419', clusterBkg: '#17171d', clusterBorder: '#33333e',
    noteBkgColor: '#2a2618', noteBorderColor: '#6b5a24', noteTextColor: '#dfdfe6',
  },
};

let mermaidP;
let seq = 0;
async function mermaid(source, dark, _settings, plain = false) {
  mermaidP ||= import('mermaid').then((m) => m.default);
  const m = await mermaidP;
  m.initialize({
    startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'inherit',
    themeVariables: { fontSize: '14px', dropShadow: 'none', ...MERMAID_THEME[dark ? 'dark' : 'light'] },
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
