// Export rendered Markdown (DOM) to a .docx file, preserving structure and formatting.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, LevelFormat,
} from 'docx';
import { svgToBlob, svgElementText } from './svgimage.js';

const HEADINGS = { H1: HeadingLevel.HEADING_1, H2: HeadingLevel.HEADING_2, H3: HeadingLevel.HEADING_3, H4: HeadingLevel.HEADING_4, H5: HeadingLevel.HEADING_5, H6: HeadingLevel.HEADING_6 };
const MONO = 'Consolas';
const MAX_W = 600; // px ≈ 6.25in printable width

async function imageData(src) {
  const res = await fetch(src);
  const blob = await res.blob();
  if (blob.type === 'image/svg+xml') return rasterize(await blob.text());
  const bmp = await createImageBitmap(blob);
  const type = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : blob.type.includes('bmp') ? 'bmp' : 'jpg';
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/bmp'].includes(blob.type)) {
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    return { data: await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer(), width: bmp.width, height: bmp.height, type: 'png' };
  }
  return { data: await blob.arrayBuffer(), width: bmp.width, height: bmp.height, type };
}

async function rasterize(svgText, width, height) {
  const blob = await svgToBlob(svgText, 'image/png', 2, '#ffffff');
  const bmp = await createImageBitmap(blob);
  return { data: await blob.arrayBuffer(), width: width || bmp.width / 2, height: height || bmp.height / 2, type: 'png' };
}

function sized({ width, height }) {
  const k = Math.min(1, MAX_W / width);
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

class Converter {
  constructor(ctx) {
    this.ctx = ctx;
    this.blocks = [];
  }

  // Inline content → runs.
  async runs(node, style = {}) {
    const out = [];
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = style.pre ? child.data : child.data.replace(/\s+/g, ' ');
        if (text) out.push(new TextRun({ text, ...this.runStyle(style) }));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child;
      const tag = el.tagName;
      if (el.matches('.code-tools, .line-numbers, .sr-only, .katex-html, button, input:not([type=checkbox]), .diagram-zoom')) continue;
      if (tag === 'BR') { out.push(new TextRun({ text: '', break: 1 })); continue; }
      if (tag === 'INPUT') { out.push(new TextRun({ text: el.checked ? '☑ ' : '☐ ', ...this.runStyle(style) })); continue; }
      if (el.classList.contains('katex')) {
        const tex = el.querySelector('annotation')?.textContent || el.textContent;
        out.push(new TextRun({ text: tex, font: 'Cambria Math', italics: true }));
        continue;
      }
      if (tag === 'IMG') { out.push(...(await this.image(el))); continue; }
      if (tag === 'svg') { out.push(...(await this.svg(el))); continue; }
      const next = { ...style };
      if (tag === 'STRONG' || tag === 'B') next.bold = true;
      if (tag === 'EM' || tag === 'I') next.italics = true;
      if (tag === 'DEL' || tag === 'S') next.strike = true;
      if (tag === 'U' || tag === 'INS') next.underline = true;
      if (tag === 'MARK') next.highlight = { 'anno-green': 'green', 'anno-blue': 'cyan', 'anno-pink': 'magenta' }[[...el.classList].find((c) => c.startsWith('anno-'))] || 'yellow';
      if (tag === 'SUP') next.superScript = true;
      if (tag === 'SUB') next.subScript = true;
      if (tag === 'CODE' || tag === 'KBD') next.code = true;
      if (tag === 'A' && el.getAttribute('href') && !el.getAttribute('href').startsWith('#') && !el.dataset.internal) {
        out.push(new ExternalHyperlink({ link: el.href, children: await this.runs(el, { ...next, link: true }) }));
        continue;
      }
      out.push(...(await this.runs(el, next)));
    }
    return out;
  }

  runStyle(s) {
    return {
      bold: s.bold, italics: s.italics, strike: s.strike, superScript: s.superScript, subScript: s.subScript,
      underline: s.underline || s.link ? {} : undefined,
      color: s.link ? '0969DA' : s.color,
      highlight: s.highlight,
      ...(s.code ? { font: MONO, size: 19, shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' } } : {}),
    };
  }

  async image(img) {
    const src = img.currentSrc || img.src;
    if (!src) return [new TextRun({ text: img.alt || '' })];
    try {
      const d = await imageData(src);
      return [new ImageRun({ type: d.type, data: d.data, transformation: sized(d), altText: { name: img.alt || 'image', description: img.alt || '', title: img.title || '' } })];
    } catch {
      return [new TextRun({ text: `[${img.alt || 'image'}]` })];
    }
  }

  async svg(svg) {
    try {
      let { text, width, height } = svgElementText(svg);
      const fig = svg.closest('.diagram');
      // Mermaid HTML labels (foreignObject) can't be rasterized; re-render with SVG text labels.
      if (fig?.dataset.kind === 'mermaid' && svg.querySelector('foreignObject') && this.ctx.mermaidPlain) {
        text = await this.ctx.mermaidPlain(fig.dataset.source);
      }
      const d = await rasterize(text, width, height);
      return [new ImageRun({ type: 'png', data: d.data, transformation: sized(d), altText: { name: 'diagram', description: fig?.dataset.kind || 'diagram', title: 'diagram' } })];
    } catch {
      return [new TextRun({ text: '[diagram]', italics: true })];
    }
  }

  para(children, opts = {}) {
    this.blocks.push(new Paragraph({ children, spacing: { after: 120 }, ...opts }));
  }

  async block(el, ctx = {}) {
    const tag = el.tagName;
    if (el.matches('.front-matter, .code-tools, .diagram-zoom')) return;
    if (HEADINGS[tag]) return this.para(await this.runs(el), { heading: HEADINGS[tag], spacing: { before: 240, after: 120 } });
    if (tag === 'P') {
      const runs = await this.runs(el);
      if (runs.length) this.para(runs, ctx.quote ? this.quoteOpts() : {});
      return;
    }
    if (tag === 'HR') return this.para([], { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D0D7DE', space: 1 } } });
    if (tag === 'PRE') {
      const code = el.querySelector('code') || el;
      const lines = code.textContent.replace(/\n$/, '').split('\n');
      lines.forEach((line, i) =>
        this.blocks.push(new Paragraph({
          children: [new TextRun({ text: line || ' ', font: MONO, size: 19 })],
          shading: { type: ShadingType.CLEAR, fill: 'F6F8FA', color: 'auto' },
          spacing: { after: i === lines.length - 1 ? 160 : 0, line: 260 },
          indent: { left: 120, right: 120 },
        })),
      );
      return;
    }
    if (tag === 'UL' || tag === 'OL') return this.list(el, (ctx.level ?? -1) + 1);
    if (tag === 'BLOCKQUOTE' || el.classList.contains('markdown-alert')) {
      for (const c of el.children) await this.block(c, { ...ctx, quote: true });
      return;
    }
    if (tag === 'TABLE') return this.table(el);
    if (el.classList.contains('diagram')) {
      const svg = el.querySelector('svg');
      if (svg) this.para(await this.svg(svg), { alignment: AlignmentType.CENTER });
      return;
    }
    if (el.classList.contains('math-block')) {
      const tex = el.querySelector('annotation')?.textContent || el.textContent;
      return this.para([new TextRun({ text: tex, font: 'Cambria Math', italics: true })], { alignment: AlignmentType.CENTER });
    }
    if (tag === 'IMG') return this.para(await this.image(el), { alignment: AlignmentType.CENTER });
    if (tag === 'SECTION' || tag === 'DIV' || tag === 'DETAILS' || tag === 'ARTICLE') {
      for (const c of el.childNodes) {
        if (c.nodeType === Node.ELEMENT_NODE) await this.block(c, ctx);
        else if (c.textContent.trim()) this.para([new TextRun(c.textContent.trim())]);
      }
      return;
    }
    if (tag === 'SUMMARY') return this.para(await this.runs(el, { bold: true }));
    const runs = await this.runs(el);
    if (runs.length) this.para(runs);
  }

  quoteOpts() {
    return { indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'D0D7DE', space: 8 } } };
  }

  async list(list, level) {
    const ordered = list.tagName === 'OL';
    for (const li of list.children) {
      const inline = document.createElement('span');
      const nested = [];
      for (const c of [...li.childNodes]) {
        if (c.nodeType === Node.ELEMENT_NODE && /^(UL|OL|PRE|TABLE|BLOCKQUOTE)$/.test(c.tagName)) nested.push(c);
        else if (c.nodeType === Node.ELEMENT_NODE && c.tagName === 'P') { inline.append(...[...c.childNodes].map((n) => n.cloneNode(true)), ' '); }
        else inline.append(c.cloneNode(true));
      }
      const task = li.classList.contains('task-list-item');
      this.blocks.push(new Paragraph({
        children: await this.runs(inline),
        ...(task ? { indent: { left: 360 * (level + 1) } } : ordered ? { numbering: { reference: 'ordered', level, instance: this.listInstance(list) } } : { bullet: { level } }),
        spacing: { after: 60 },
      }));
      for (const n of nested) await this.block(n, { level });
    }
  }

  listInstance(list) {
    this.instances ||= new Map();
    if (!this.instances.has(list)) this.instances.set(list, this.instances.size + 1);
    return this.instances.get(list);
  }

  async table(table) {
    const rows = [];
    for (const tr of table.querySelectorAll('tr')) {
      const cells = [];
      for (const td of tr.children) {
        const header = td.tagName === 'TH';
        const align = td.getAttribute('align') || td.style.textAlign;
        cells.push(new TableCell({
          children: [new Paragraph({ children: await this.runs(td, { bold: header }), alignment: align === 'right' ? AlignmentType.RIGHT : align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT })],
          shading: header ? { type: ShadingType.CLEAR, fill: 'F6F8FA', color: 'auto' } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
        }));
      }
      rows.push(new TableRow({ children: cells, tableHeader: tr.parentElement.tagName === 'THEAD' }));
    }
    if (rows.length) this.blocks.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    this.para([]);
  }
}

export async function exportDocx(root, { title, mermaidPlain }) {
  const conv = new Converter({ mermaidPlain });
  for (const el of root.children) await conv.block(el);
  const doc = new Document({
    title,
    creator: 'MarkCraft',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [{
        reference: 'ordered',
        levels: Array.from({ length: 6 }, (_, level) => ({
          level, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3], text: `%${level + 1}.`,
          alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      }],
    },
    sections: [{ children: conv.blocks.length ? conv.blocks : [new Paragraph('')] }],
  });
  return Packer.toBlob(doc);
}

