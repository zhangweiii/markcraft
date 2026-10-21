// Optional Markdown syntax plugins, toggled from Settings → Plugins.
import { get as emojiFor } from 'node-emoji';
import extendedTables from 'marked-extended-tables/src/index.js';
import { markedSmartypants } from 'marked-smartypants';

// Simple delimited inline syntax: ==mark==, ++ins++, ~sub~, ^sup^
function inline(name, delim, tag) {
  const d = delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const single = delim.length === 1;
  const re = single
    ? new RegExp(`^${d}(?!${d})([^\\s${d}](?:[^${d}\\n]*?[^\\s${d}])?)${d}(?!${d})`)
    : new RegExp(`^${d}(?=\\S)([\\s\\S]*?\\S)${d}`);
  return {
    name,
    level: 'inline',
    start(src) {
      const i = src.indexOf(delim);
      return i < 0 ? undefined : i;
    },
    tokenizer(src) {
      const m = re.exec(src);
      if (m) return { type: name, raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
    },
    renderer(token) {
      return `<${tag}>${this.parser.parseInline(token.tokens)}</${tag}>`;
    },
  };
}

const emoji = {
  name: 'emoji',
  level: 'inline',
  start(src) {
    const i = src.search(/:[\w+-]+:/);
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^:([\w+-]+):/.exec(src);
    if (m && emojiFor(m[1])) return { type: 'emoji', raw: m[0], emoji: emojiFor(m[1]) };
  },
  renderer: (t) => t.emoji,
};

// Term
// : Definition (one or more)
const deflist = {
  name: 'deflist',
  level: 'block',
  start(src) {
    const i = src.search(/^[^\n:][^\n]*\n(?:\n)?: /m);
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^((?:[^\n:][^\n]*\n(?:\n)?(?:: [^\n]*(?:\n(?: {2,}|\t)[^\n]*)*\n?)+\n?)+)/.exec(src);
    if (!m) return;
    const items = [];
    for (const line of m[1].split('\n')) {
      if (!line.trim()) continue;
      if (/^: /.test(line)) items.at(-1)?.defs.push(line.slice(2));
      else if (/^(?: {2,}|\t)/.test(line) && items.at(-1)?.defs.length) items.at(-1).defs[items.at(-1).defs.length - 1] += '\n' + line.trim();
      else items.push({ term: line, defs: [] });
    }
    if (!items.length || items.some((i) => !i.defs.length)) return;
    return {
      type: 'deflist',
      raw: m[0],
      items: items.map((i) => ({ term: this.lexer.inlineTokens(i.term), defs: i.defs.map((d) => this.lexer.inlineTokens(d)) })),
    };
  },
  renderer(token) {
    return `<dl>${token.items.map((i) => `<dt>${this.parser.parseInline(i.term)}</dt>${i.defs.map((d) => `<dd>${this.parser.parseInline(d)}</dd>`).join('')}`).join('')}</dl>\n`;
  },
};

// ::: type Optional title
// content
// :::
const CONTAINER_TYPES = /^(tip|info|note|warning|danger|caution|important|details|success|error|[a-z][\w-]*)$/i;
const container = {
  name: 'container',
  level: 'block',
  start(src) {
    const i = src.search(/^:{3,}/m);
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const open = /^(:{3,})[ \t]*([\w-]+)[ \t]*([^\n]*)\n/.exec(src);
    if (!open || !CONTAINER_TYPES.test(open[2])) return;
    const fence = open[1];
    // Find the matching closing fence, allowing nested containers.
    const lines = src.slice(open[0].length).split('\n');
    let depth = 0;
    let consumed = open[0].length;
    const body = [];
    for (const line of lines) {
      consumed += line.length + 1;
      if (new RegExp(`^:{3,}[ \\t]*[\\w-]+`).test(line)) depth++;
      else if (/^:{3,}\s*$/.test(line) && line.trim().length >= (depth ? 3 : fence.length)) {
        if (depth === 0) {
          return {
            type: 'container',
            raw: src.slice(0, Math.min(consumed, src.length)),
            kind: open[2].toLowerCase(),
            title: open[3].trim(),
            tokens: this.lexer.blockTokens(body.join('\n')),
          };
        }
        depth--;
      }
      body.push(line);
    }
  },
  renderer(token) {
    const inner = this.parser.parse(token.tokens);
    const title = token.title || (token.kind === 'details' ? 'Details' : token.kind[0].toUpperCase() + token.kind.slice(1));
    if (token.kind === 'details') return `<details class="container container-details"><summary>${title}</summary>${inner}</details>\n`;
    return `<div class="container container-${token.kind}"><div class="container-title">${title}</div>${inner}</div>\n`;
  },
};

export function pluginExtensions(plugins) {
  const exts = [];
  if (plugins.mark) exts.push(inline('mark', '==', 'mark'));
  if (plugins.insertion) exts.push(inline('ins', '++', 'ins'));
  if (plugins.superscript) exts.push(inline('sup', '^', 'sup'));
  if (plugins.subscript) exts.push(inline('sub', '~', 'sub'));
  if (plugins.emoji) exts.push(emoji);
  if (plugins.deflist) exts.push(deflist);
  if (plugins.container) exts.push(container);
  const uses = [{ extensions: exts }];
  if (plugins.tables) uses.push(extendedTables());
  if (plugins.typographer) uses.push(markedSmartypants());
  return uses;
}

// *[HTML]: Hyper Text Markup Language
const ABBR_DEF = /^\*\[([^\]\n]+)\]:[ \t]*(.+)$/gm;
export function extractAbbreviations(text) {
  const defs = {};
  const stripped = text.replace(ABBR_DEF, (_, k, v) => { defs[k] = v.trim(); return ''; });
  return { text: stripped, defs };
}

export function applyAbbreviations(root, defs) {
  const keys = Object.keys(defs).sort((a, b) => b.length - a.length);
  if (!keys.length) return;
  const re = new RegExp(`(^|[^\\w])(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w])`, 'g');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('code, pre, a, abbr, .katex, .diagram') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (re.test(n.data)) nodes.push(n);
  for (const node of nodes) {
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of node.data.matchAll(re)) {
      const start = m.index + m[1].length;
      frag.append(node.data.slice(last, start));
      const abbr = document.createElement('abbr');
      abbr.title = defs[m[2]];
      abbr.textContent = m[2];
      frag.append(abbr);
      last = start + m[2].length;
    }
    frag.append(node.data.slice(last));
    node.replaceWith(frag);
  }
}

// Minimal YAML front matter → key/value rows for the metadata card.
export function parseFrontMatter(src) {
  const rows = [];
  let cur = null;
  for (const line of src.split('\n')) {
    const kv = /^([\w.-][\w .-]*):\s*(.*)$/.exec(line);
    if (kv) {
      cur = { key: kv[1].trim(), value: kv[2].trim(), list: [] };
      rows.push(cur);
    } else if (cur && /^\s*-\s+/.test(line)) cur.list.push(line.replace(/^\s*-\s+/, '').trim());
    else if (cur && line.trim()) cur.value += (cur.value ? ' ' : '') + line.trim();
  }
  for (const r of rows) {
    const inline = /^\[(.*)\]$/.exec(r.value);
    if (inline) { r.list = inline[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean); r.value = ''; }
    r.value = r.value.replace(/^['"]|['"]$/g, '');
  }
  return rows;
}
