// Mintlify MDX components (Card, CardGroup, Tabs, Steps, Accordion, CodeGroup, Frame,
// callouts, ParamField/ResponseField). Tags are rewritten to <div class="mint …"> before
// Markdown parsing (so their bodies are still Markdown) and finished in the DOM afterwards.
import { escapeHtml } from './render.js';
import { icon } from '../shared/icons.js';

const BLOCKS = ['Card', 'CardGroup', 'Columns', 'Tabs', 'Tab', 'Steps', 'Step', 'Accordion', 'AccordionGroup', 'CodeGroup', 'Frame',
  'Note', 'Tip', 'Warning', 'Info', 'Check', 'Danger', 'Callout', 'ParamField', 'ResponseField', 'Expandable', 'Update', 'Tooltip'];
const TAG = new RegExp(`<(/?)(${BLOCKS.join('|')})((?:\\s+[\\w-]+(?:=(?:"[^"]*"|'[^']*'|\\{[^}]*\\}))?)*)\\s*(/?)>`, 'g');
const ATTR = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}))?/g;

function attrs(src) {
  const out = {};
  for (const m of src.matchAll(ATTR)) out[m[1]] = m[2] ?? m[3] ?? (m[4] !== undefined ? m[4].replace(/^["']|["']$/g, '') : true);
  return out;
}

// Rewrite component tags outside code fences / inline code.
export function preprocessMintlify(text) {
  if (!/<[A-Z]/.test(text)) return text;
  const lines = text.split('\n');
  let fence = null;
  const out = [];
  for (const line of lines) {
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) {
      if (!fence) fence = f[1];
      else if (line.trim().startsWith(fence)) fence = null;
      out.push(line);
      continue;
    }
    if (fence) { out.push(line); continue; }
    // Keep inline code spans untouched.
    const parts = line.split(/(`[^`]*`)/);
    const rewritten = parts.map((p, i) => (i % 2 ? p : p.replace(TAG, (_, close, name, a, self) => {
      if (close) return '\n\n</div>\n\n';
      const data = escapeHtml(JSON.stringify(attrs(a)));
      const open = `\n\n<div class="mint mint-${name.toLowerCase()}" data-mint="${data}">\n\n`;
      return self ? open + '</div>\n\n' : open;
    })));
    out.push(rewritten.join(''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

const CALLOUTS = { note: 'info', tip: 'sparkles', warning: 'info', info: 'info', check: 'check', danger: 'info', callout: 'info' };

const data = (el) => { try { return JSON.parse(el.dataset.mint || '{}'); } catch { return {}; } };

export function enhanceMintlify(root) {
  const all = [...root.querySelectorAll('.mint')];
  if (!all.length) return;
  // Innermost first so nested components are finished before their parents.
  for (const el of all.reverse()) {
    const d = data(el);
    const kind = [...el.classList].find((c) => c.startsWith('mint-')).slice(5);
    if (CALLOUTS[kind]) {
      el.classList.add('mint-callout');
      el.insertAdjacentHTML('afterbegin', `<span class="mint-callout-icon">${icon(CALLOUTS[kind], 16)}</span>`);
      const body = document.createElement('div');
      body.className = 'mint-callout-body';
      while (el.childNodes.length > 1) body.append(el.childNodes[1]);
      el.append(body);
    } else if (kind === 'card') {
      const head = `${d.icon ? `<span class="mint-card-icon">${icon(d.icon in ICON_MAP ? ICON_MAP[d.icon] : 'file', 20)}</span>` : ''}${d.title ? `<div class="mint-card-title">${escapeHtml(d.title)}</div>` : ''}`;
      el.insertAdjacentHTML('afterbegin', head);
      if (d.href) {
        const a = document.createElement('a');
        a.href = d.href;
        a.className = el.className;
        if (/^https?:/.test(d.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        a.append(...el.childNodes);
        el.replaceWith(a);
      }
    } else if (kind === 'cardgroup' || kind === 'columns') {
      el.style.setProperty('--cols', Math.max(1, Math.min(4, +d.cols || 2)));
    } else if (kind === 'tabs' || kind === 'codegroup') {
      buildTabs(el, kind);
    } else if (kind === 'steps') {
      [...el.children].filter((c) => c.classList.contains('mint-step')).forEach((s, i) => s.style.setProperty('--n', `"${data(s).stepNumber || i + 1}"`));
    } else if (kind === 'step') {
      if (d.title) el.insertAdjacentHTML('afterbegin', `<div class="mint-step-title">${escapeHtml(d.title)}</div>`);
    } else if (kind === 'accordion' || kind === 'expandable') {
      const det = document.createElement('details');
      det.className = el.className;
      if (d.defaultOpen) det.open = true;
      det.innerHTML = `<summary>${escapeHtml(d.title || (kind === 'expandable' ? 'Show properties' : 'Details'))}</summary>`;
      const body = document.createElement('div');
      body.className = 'mint-accordion-body';
      body.append(...el.childNodes);
      det.append(body);
      el.replaceWith(det);
    } else if (kind === 'frame') {
      if (d.caption) el.insertAdjacentHTML('beforeend', `<div class="mint-frame-caption">${escapeHtml(d.caption)}</div>`);
    } else if (kind === 'paramfield' || kind === 'responsefield') {
      const name = d.path || d.query || d.body || d.header || d.name || '';
      const where = d.query ? 'query' : d.path ? 'path' : d.header ? 'header' : d.body ? 'body' : '';
      el.insertAdjacentHTML('afterbegin', `<div class="mint-field-head"><code class="mint-field-name">${escapeHtml(String(name))}</code>${d.type ? `<span class="mint-badge">${escapeHtml(String(d.type))}</span>` : ''}${where ? `<span class="mint-badge muted">${where}</span>` : ''}${d.required ? '<span class="mint-badge req">required</span>' : ''}${d.default !== undefined ? `<span class="mint-badge muted">default: ${escapeHtml(String(d.default))}</span>` : ''}</div>`);
    } else if (kind === 'update') {
      el.insertAdjacentHTML('afterbegin', `<div class="mint-update-label">${escapeHtml(d.label || '')}</div>${d.description ? `<div class="mint-update-desc">${escapeHtml(d.description)}</div>` : ''}`);
    } else if (kind === 'tooltip') {
      el.title = d.tip || '';
    }
  }
}

function buildTabs(el, kind) {
  const panes = kind === 'codegroup'
    ? [...el.children].filter((c) => c.matches('pre, .code-block, .diagram'))
    : [...el.children].filter((c) => c.classList.contains('mint-tab'));
  if (!panes.length) return;
  const titles = panes.map((p, i) => {
    if (kind === 'codegroup') {
      const code = p.querySelector('code');
      return code?.dataset.title || [...(code?.classList || [])].find((c) => c.startsWith('language-'))?.slice(9) || `Tab ${i + 1}`;
    }
    return data(p).title || `Tab ${i + 1}`;
  });
  const bar = document.createElement('div');
  bar.className = 'mint-tabbar';
  bar.setAttribute('contenteditable', 'false');
  titles.forEach((title, i) => {
    const b = document.createElement('button');
    b.textContent = title;
    b.className = i ? '' : 'on';
    b.addEventListener('click', () => {
      bar.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', j === i));
      panes.forEach((p, j) => (p.hidden = j !== i));
    });
    bar.append(b);
  });
  panes.forEach((p, j) => (p.hidden = j !== 0));
  el.prepend(bar);
}

// Common Mintlify (Font Awesome) icon names → bundled Lucide icons.
const ICON_MAP = {
  rocket: 'sparkles', book: 'read', 'book-open': 'read', code: 'raw', terminal: 'terminal', gear: 'settings', star: 'star', globe: 'globe',
  folder: 'folder', file: 'file', 'file-lines': 'file', pen: 'edit', pencil: 'edit', bolt: 'zap', robot: 'agent', bookmark: 'bookmark',
  'circle-info': 'info', info: 'info', keyboard: 'keyboard', 'magnifying-glass': 'search', download: 'download', upload: 'upload',
  palette: 'palette', puzzle: 'puzzle', 'puzzle-piece': 'puzzle', sitemap: 'mindmap', 'diagram-project': 'workflow', check: 'check',
};
