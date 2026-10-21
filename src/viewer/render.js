// Markdown → sanitized HTML, plus DOM post-processing (mermaid, math, code tools,
// task lists, relative links/images).
import { Marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import markedFootnote from 'marked-footnote';
import markedAlert from 'marked-alert';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { DIAGRAM_LANGS, renderDiagrams } from './diagrams.js';
import { t } from '../shared/i18n.js';
import { pluginExtensions, extractAbbreviations, applyAbbreviations, parseFrontMatter } from './plugins.js';

export const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n?/;
const TASK_ITEM = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;
const FENCE = /^\s*(```|~~~)/;

function renderKatex(tex, displayMode) {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false, output: 'htmlAndMathml' });
  } catch (e) {
    return `<code class="math-error">${escapeHtml(tex)}</code>`;
  }
}

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const mathExtensions = [
  {
    name: 'mathBlock',
    level: 'block',
    start: (src) => src.match(/\$\$|\\\[/)?.index,
    tokenizer(src) {
      const m = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n|$)/.exec(src);
      if (m) return { type: 'mathBlock', raw: m[0], text: (m[1] ?? m[2]).trim() };
    },
    renderer: (t) => `<div class="math-block">${renderKatex(t.text, true)}</div>\n`,
  },
  {
    name: 'mathInline',
    level: 'inline',
    start(src) {
      const i = src.search(/\$|\\\(/);
      return i < 0 ? undefined : i;
    },
    tokenizer(src) {
      const m = /^\$\$((?:\\.|[^\\$])+?)\$\$/.exec(src) ||
        /^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<![\s\\])\$(?!\d)/.exec(src) ||
        /^\\\(((?:\\.|[^\\])+?)\\\)/.exec(src);
      if (m) return { type: 'mathInline', raw: m[0], text: m[1], display: m[0].startsWith('$$') };
    },
    renderer: (t) => renderKatex(t.text, t.display),
  },
];

function createMarked(settings) {
  const p = settings.plugins;
  const exts = [
    markedHighlight({
      emptyLangClass: 'hljs',
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        const language = (lang || '').split(/[\s{]/)[0].toLowerCase();
        if (DIAGRAM_LANGS[language] || language === 'math') return escapeHtml(code);
        if (language && hljs.getLanguage(language)) return hljs.highlight(code, { language, ignoreIllegals: true }).value;
        return escapeHtml(code);
      },
    }),
    gfmHeadingId(),
  ];
  if (p.footnote) exts.push(markedFootnote());
  if (p.alerts) exts.push(markedAlert());
  const marked = new Marked(...exts);
  marked.setOptions({ gfm: true, breaks: settings.lineBreaks === 'github' });
  if (p.katex) marked.use({ extensions: mathExtensions });
  for (const use of pluginExtensions(p)) marked.use(use);
  // Without the task-list plugin, render "[ ]" items as plain text.
  if (!p.taskLists) marked.use({ renderer: { checkbox: () => '' }, walkTokens: (tok) => { if (tok.type === 'list_item' && tok.task) { tok.task = false; tok.text = (tok.checked ? '[x] ' : '[ ] ') + tok.text; } } });
  return marked;
}

function frontMatterCard(src) {
  const rows = parseFrontMatter(src);
  if (!rows.length) return `<details class="fm-card" open><summary>${t('Document Metadata')}</summary><pre>${escapeHtml(src)}</pre></details>`;
  const cell = (r) => (r.list.length ? r.list.map((v) => `<span class="fm-tag">${escapeHtml(v)}</span>`).join('') : escapeHtml(r.value));
  return `<details class="fm-card" open><summary>${t('Document Metadata')}</summary><table>${rows.map((r) => `<tr><th>${escapeHtml(r.key)}</th><td>${cell(r)}</td></tr>`).join('')}</table></details>`;
}

// Relative image URLs would resolve against the extension origin and 404 before
// enhance() can load them, so park them in data-src.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'IMG') return;
  const src = node.getAttribute('src');
  if (src && !/^(data|blob|https?):/i.test(src)) {
    node.setAttribute('data-src', src);
    node.removeAttribute('src');
  }
});

let cached;
export function renderMarkdown(text, settings) {
  const key = JSON.stringify([settings.plugins, settings.lineBreaks]);
  if (!cached || cached.key !== key) cached = { key, marked: createMarked(settings) };

  let frontMatter = null;
  const fm = FRONT_MATTER.exec(text);
  if (fm && settings.plugins.frontMatter) {
    frontMatter = fm[1];
    text = text.slice(fm[0].length);
  }
  let abbr = {};
  if (settings.plugins.abbreviation) ({ text, defs: abbr } = extractAbbreviations(text));
  const raw = cached.marked.parse(text);
  let html = DOMPurify.sanitize(raw, {
    ADD_TAGS: ['semantics', 'annotation'],
    ADD_ATTR: ['target', 'checked', 'align', 'encoding', 'rowspan', 'colspan'],
    ALLOW_DATA_ATTR: true,
  });
  if (frontMatter && settings.frontMatterCard) html = frontMatterCard(frontMatter) + html;
  if (Object.keys(abbr).length) html = `<template data-abbr="${escapeHtml(JSON.stringify(abbr))}"></template>` + html;
  return html;
}

// Positions (character offsets) of every task-list checkbox in the source, skipping code fences.
export function taskPositions(text) {
  const out = [];
  let inFence = null;
  let offset = 0;
  const fm = FRONT_MATTER.exec(text);
  const lines = text.split('\n');
  let start = 0;
  if (fm) {
    const n = fm[0].split('\n').length - 1;
    for (let i = 0; i < n; i++) offset += lines[i].length + 1;
    start = n;
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const f = FENCE.exec(line);
    if (f) {
      if (!inFence) inFence = f[1];
      else if (line.trim().startsWith(inFence)) inFence = null;
    } else if (!inFence) {
      const m = TASK_ITEM.exec(line);
      if (m) out.push(offset + m[1].length + 1);
    }
    offset += line.length + 1;
  }
  return out;
}

const COPY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';

/**
 * Enhance freshly rendered HTML inside `root`.
 * ctx: { settings, dark, resolveAsset(href) -> Promise<string|null>, resolveLink(href) -> string|null, onTaskToggle(index, checked) }
 */
const ALERT_TITLES = { Note: 'Note', Tip: 'Tip', Important: 'Important', Warning: 'Warning', Caution: 'Caution' };

export async function enhance(root, ctx) {
  const abbrTpl = root.querySelector('template[data-abbr]');
  if (abbrTpl) {
    applyAbbreviations(root, JSON.parse(abbrTpl.dataset.abbr));
    abbrTpl.remove();
  }
  if (ctx.settings.localizeAlerts) {
    for (const title of root.querySelectorAll('.markdown-alert-title')) {
      const node = [...title.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && ALERT_TITLES[n.data.trim()]);
      if (node) node.data = node.data.replace(node.data.trim(), t(node.data.trim()));
    }
  }
  // Code blocks: language label, copy button, optional line numbers.
  for (const code of root.querySelectorAll('pre > code')) {
    const pre = code.parentElement;
    const lang = [...code.classList].find((c) => c.startsWith('language-'))?.slice(9) || '';
    if (lang === 'math' && ctx.settings.plugins.katex) {
      const div = document.createElement('div');
      div.className = 'math-block';
      div.innerHTML = renderKatex(code.textContent, true);
      pre.replaceWith(div);
      continue;
    }
    const kind = DIAGRAM_LANGS[lang.toLowerCase()];
    if (kind && ctx.settings.plugins[kind]) {
      pre.classList.add('diagram-pending');
      pre.dataset.kind = kind;
      pre.dataset.source = code.textContent;
      continue;
    }
    const tools = document.createElement('div');
    tools.className = 'code-tools';
    tools.contentEditable = 'false';
    if (lang) tools.innerHTML = `<span class="code-lang">${escapeHtml(lang)}</span>`;
    const btn = document.createElement('button');
    btn.className = 'code-copy';
    btn.title = t('Copy code');
    btn.innerHTML = COPY_ICON;
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(code.textContent);
      btn.classList.add('done');
      setTimeout(() => btn.classList.remove('done'), 1200);
    });
    tools.append(btn);
    pre.classList.add('code-block');
    if (ctx.settings.codeLineNumbers) {
      const n = code.textContent.replace(/\n$/, '').split('\n').length;
      const gutter = document.createElement('span');
      gutter.className = 'line-numbers';
      gutter.setAttribute('aria-hidden', 'true');
      gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
      pre.classList.add('with-line-numbers');
      pre.prepend(gutter);
    }
    pre.append(tools);
  }

  // Task lists: clickable checkboxes that edit the source.
  root.querySelectorAll('input[type="checkbox"]').forEach((box, i) => {
    if (!box.closest('li')) return;
    box.removeAttribute('disabled');
    box.closest('li').classList.add('task-list-item');
    box.closest('ul,ol')?.classList.add('contains-task-list');
    box.addEventListener('change', () => ctx.onTaskToggle?.(i, box.checked));
  });

  // Tables scroll horizontally instead of overflowing.
  for (const table of root.querySelectorAll('table')) {
    if (table.parentElement.classList.contains('table-wrap')) continue;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.replaceWith(wrap);
    wrap.append(table);
  }

  // Links: in-page anchors, other Markdown documents, external.
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) continue;
    const internal = ctx.resolveLink?.(href);
    if (internal) {
      a.href = internal;
      a.dataset.internal = '1';
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  }

  // Relative images (local files need to be loaded through the extension).
  const imgs = [...root.querySelectorAll('img[data-src]:not([src])')];
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.dataset.src;
      const url = await ctx.resolveAsset?.(src).catch(() => null);
      if (url) img.src = url;
      else img.classList.add('broken');
    }),
  );

  await renderDiagrams(root, ctx);
}

export function katexHtml(tex) {
  return renderKatex(tex, true);
}
