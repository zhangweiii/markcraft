// Line diff rendering (+/−) used for external-change banners and agent review.
import { diffLines } from 'diff';
import { escapeHtml } from './render.js';

export function diffStats(a, b) {
  let added = 0;
  let removed = 0;
  for (const part of diffLines(a, b)) {
    if (part.added) added += part.count;
    else if (part.removed) removed += part.count;
  }
  return { added, removed };
}

// Unified diff as HTML with `context` unchanged lines around each change.
export function renderDiff(a, b, context = 3) {
  const rows = [];
  let oldNo = 1;
  let newNo = 1;
  for (const part of diffLines(a, b)) {
    const lines = part.value.replace(/\n$/, '').split('\n');
    for (const line of lines) {
      if (part.added) rows.push({ t: '+', line, n: newNo++ });
      else if (part.removed) rows.push({ t: '-', line, o: oldNo++ });
      else rows.push({ t: ' ', line, o: oldNo++, n: newNo++ });
    }
  }
  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, i) => {
    if (r.t === ' ') return;
    for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep[j] = true;
  });
  let html = '';
  let skipped = 0;
  rows.forEach((r, i) => {
    if (!keep[i]) { skipped++; return; }
    if (skipped) { html += `<div class="diff-skip">⋯ ${skipped} unchanged line${skipped > 1 ? 's' : ''}</div>`; skipped = 0; }
    const cls = r.t === '+' ? 'add' : r.t === '-' ? 'del' : 'ctx';
    html += `<div class="diff-line ${cls}"><span class="ln">${r.o ?? ''}</span><span class="ln">${r.n ?? ''}</span><span class="sign">${r.t}</span><span class="code">${escapeHtml(r.line) || ' '}</span></div>`;
  });
  if (skipped) html += `<div class="diff-skip">⋯ ${skipped} unchanged line${skipped > 1 ? 's' : ''}</div>`;
  return html || '<div class="diff-skip">No changes</div>';
}
