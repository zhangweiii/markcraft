// Presentation mode: turns a document into slides. Slides are split on `---`
// separators, or on h1/h2 headings when there are none. Speaker notes come from
// lines after `Note:` / `Notes:` or `<!-- notes ... -->` comments.
import { FRONT_MATTER, renderMarkdown, enhance } from './render.js';

const THEMES = ['light', 'dark', 'sepia', 'night'];
let ui;
let state;

export function splitSlides(markdown) {
  const text = markdown.replace(FRONT_MATTER, '');
  const lines = text.split('\n');
  const chunks = [[]];
  let fence = false;
  let hasRules = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!fence && /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) hasRules = true;
  }
  fence = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const isRule = !fence && /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
    const isHead = !fence && /^#{1,2}\s/.test(l);
    if (hasRules ? isRule : isHead && chunks.at(-1).some((x) => x.trim())) chunks.push([]);
    if (!(hasRules && isRule)) chunks.at(-1).push(l);
  }
  return chunks
    .map((c) => c.join('\n'))
    .filter((c) => c.trim())
    .map((c) => {
      let notes = '';
      c = c.replace(/<!--\s*notes?:?([\s\S]*?)-->/gi, (_, n) => { notes += n.trim() + '\n'; return ''; });
      const m = /^\s*Notes?:\s*$|^\s*Notes?:\s+/im.exec(c);
      if (m) { notes += c.slice(m.index).replace(/^\s*Notes?:\s*/i, ''); c = c.slice(0, m.index); }
      return { body: c.trim(), notes: notes.trim() };
    });
}

function build() {
  ui = document.createElement('div');
  ui.className = 'present';
  ui.innerHTML = `<div class="present-stage"><div class="slide markdown-body"></div></div>
    <div class="present-notes" hidden></div>
    <div class="present-progress"><div></div></div>
    <div class="present-bar">
      <button data-p="prev" title="Previous (←)">‹</button><span class="present-count"></span><button data-p="next" title="Next (→ / Space)">›</button>
      <span class="sep"></span>
      <button data-p="play" title="Auto-play (A)">▶</button>
      <select data-p="interval" title="Auto-play interval"><option value="5">5s</option><option value="10" selected>10s</option><option value="20">20s</option><option value="30">30s</option><option value="60">60s</option></select>
      <button data-p="theme" title="Theme (T)">◐</button><button data-p="notes" title="Speaker notes (N)">✎</button><button data-p="full" title="Fullscreen (F)">⛶</button><button data-p="close" title="Exit (Esc)">✕</button>
    </div>`;
  document.body.append(ui);
  ui.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (b && b.tagName === 'BUTTON') return act(b.dataset.p);
    if (e.target.closest('.present-stage') && !e.target.closest('a, button, input, .diagram, img')) go(state.index + (e.clientX < innerWidth / 4 ? -1 : 1));
  });
  ui.querySelector('select').addEventListener('change', () => { if (state.timer) { stopPlay(); startPlay(); } });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', () => !ui.hidden && fit());
  let touchX = null;
  ui.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  ui.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) go(state.index + (dx < 0 ? 1 : -1));
    touchX = null;
  });
  let hideTimer;
  ui.addEventListener('mousemove', () => {
    ui.classList.add('show-bar');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => ui.classList.remove('show-bar'), 2200);
  });
}

function onKey(e) {
  if (!ui || ui.hidden) return;
  const k = e.key;
  const map = { ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ' ': 'next', Enter: 'next', ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev', Backspace: 'prev', Home: 'first', End: 'last', Escape: 'close', f: 'full', F: 'full', n: 'notes', N: 'notes', t: 'theme', T: 'theme', a: 'play', A: 'play' };
  if (!map[k] || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  e.stopPropagation();
  act(map[k]);
}

function act(a) {
  if (a === 'next') go(state.index + 1);
  if (a === 'prev') go(state.index - 1);
  if (a === 'first') go(0);
  if (a === 'last') go(state.slides.length - 1);
  if (a === 'close') close();
  if (a === 'notes') { const n = ui.querySelector('.present-notes'); n.hidden = !n.hidden; fit(); }
  if (a === 'theme') {
    state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
    ui.dataset.theme = state.theme;
    localStorage.setItem('mc-present-theme', state.theme);
    go(state.index, true);
  }
  if (a === 'full') document.fullscreenElement ? document.exitFullscreen() : ui.requestFullscreen?.();
  if (a === 'play') state.timer ? stopPlay() : startPlay();
}

function startPlay() {
  const secs = +ui.querySelector('select').value;
  state.timer = setInterval(() => (state.index >= state.slides.length - 1 ? stopPlay() : go(state.index + 1)), secs * 1000);
  ui.querySelector('[data-p="play"]').textContent = '❚❚';
}
function stopPlay() {
  clearInterval(state.timer);
  state.timer = null;
  ui.querySelector('[data-p="play"]').textContent = '▶';
}

// Scale the fixed 1280×720 slide to fit the stage.
function fit() {
  const stage = ui.querySelector('.present-stage');
  const slide = ui.querySelector('.slide');
  const s = Math.min(stage.clientWidth / 1280, stage.clientHeight / 720);
  slide.style.transform = `translate(-50%, -50%) scale(${s})`;
}

async function go(i, force = false) {
  i = Math.max(0, Math.min(state.slides.length - 1, i));
  if (i === state.index && !force) return;
  state.index = i;
  const slide = ui.querySelector('.slide');
  const { body, notes } = state.slides[i];
  slide.innerHTML = renderMarkdown(body, state.ctx.settings);
  slide.classList.toggle('title-slide', /^#\s/.test(body) && body.split('\n').filter((l) => l.trim()).length <= 3);
  await enhance(slide, { ...state.ctx, dark: state.theme === 'dark' || state.theme === 'night' });
  ui.querySelector('.present-notes').textContent = notes || 'No speaker notes for this slide.';
  ui.querySelector('.present-count').textContent = `${i + 1} / ${state.slides.length}`;
  ui.querySelector('.present-progress > div').style.width = `${((i + 1) / state.slides.length) * 100}%`;
  fit();
}

function close() {
  stopPlay();
  if (document.fullscreenElement) document.exitFullscreen();
  ui.hidden = true;
  state.onClose?.();
}

export function present(markdown, ctx, { startAt = 0, onClose } = {}) {
  if (!ui) build();
  const slides = splitSlides(markdown);
  if (!slides.length) return false;
  state = { slides, index: -1, ctx, onClose, theme: localStorage.getItem('mc-present-theme') || 'light' };
  ui.dataset.theme = state.theme;
  ui.hidden = false;
  go(startAt);
  ui.requestFullscreen?.().catch(() => {});
  return true;
}
