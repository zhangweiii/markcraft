// Flattens the text nodes of a container so string offsets can be mapped back to DOM Ranges.
const SKIP = 'script,style,.code-tools,.line-numbers,.katex-mathml,.mermaid-error-msg,[data-noindex]';

export function buildIndex(root) {
  const nodes = [];
  let text = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n, start: text.length });
    text += n.data;
  }
  return { text, nodes };
}

function locate(index, offset, preferNext) {
  const { nodes } = index;
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (nodes[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  let entry = nodes[lo];
  // An offset at the very end of a node may belong to the start of the next one.
  if (preferNext && entry && offset - entry.start === entry.node.data.length && nodes[lo + 1]) entry = nodes[lo + 1];
  return { node: entry.node, offset: offset - entry.start };
}

export function rangeFromOffsets(index, start, end) {
  if (!index.nodes.length) return null;
  const a = locate(index, start, true);
  const b = locate(index, end, false);
  const r = document.createRange();
  r.setStart(a.node, Math.min(a.offset, a.node.data.length));
  r.setEnd(b.node, Math.min(b.offset, b.node.data.length));
  return r;
}

// Offset of a DOM point (from a Selection) within the index text.
export function offsetOf(index, node, offset) {
  if (node.nodeType !== Node.TEXT_NODE) {
    // Element boundary: use the first indexed text node at or after the point.
    const child = node.childNodes[offset];
    const target = child || node;
    for (const e of index.nodes) {
      const pos = target.compareDocumentPosition(e.node);
      if (e.node === target || pos & Node.DOCUMENT_POSITION_FOLLOWING || pos & Node.DOCUMENT_POSITION_CONTAINED_BY) return e.start;
    }
    return index.text.length;
  }
  const e = index.nodes.find((x) => x.node === node);
  return e ? e.start + offset : -1;
}

export function scrollRangeIntoView(range, scroller, center = true) {
  const rect = range.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (!center && rect.top >= box.top + 40 && rect.bottom <= box.bottom - 40) return;
  scroller.scrollTo({ top: scroller.scrollTop + rect.top - box.top - box.height / 3, behavior: 'smooth' });
}

export const supportsHighlights = typeof CSS !== 'undefined' && 'highlights' in CSS;
