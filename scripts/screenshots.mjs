// Captures the website screenshots from the real extension (dist/) and site/demo/.
// Usage: npm run build && node scripts/screenshots.mjs   (optionally CH=/path/to/chrome, ONLY=hero,review)
import { chromium } from 'playwright';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'site/assets/screens');
await mkdir(out, { recursive: true });
const work = await mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'mc-shots-'));
await cp(path.join(root, 'site/demo'), path.join(work, 'atlas'), { recursive: true });
const docUrl = (name) => 'file://' + path.join(work, 'atlas', name);
const only = process.env.ONLY?.split(',');

async function launch(lang) {
  const profile = await mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'mc-shots-profile-'));
  return chromium.launchPersistentContext(profile, {
    headless: !process.env.HEADED,
    executablePath: process.env.CH || chromium.executablePath(),
    args: [`--disable-extensions-except=${path.join(root, 'dist')}`, `--load-extension=${path.join(root, 'dist')}`, `--lang=${lang}`],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: lang,
  });
}

// Opens a document with the given settings/layout and waits for diagrams and fonts.
async function open(ctx, name, { settings = {}, layout = {} } = {}) {
  const page = await ctx.newPage();
  await page.goto(docUrl(name));
  await page.waitForURL(/viewer\.html/);
  await page.evaluate(async ({ settings, layout }) => {
    const cur = (await chrome.storage.sync.get('settings')).settings || {};
    await chrome.storage.sync.set({ settings: { ...cur, whatsNew: false, frontMatterCard: false, ...settings } });
    const lay = (await chrome.storage.local.get('layout')).layout || {};
    await chrome.storage.local.set({ layout: { ...lay, ...layout } });
  }, { settings, layout });
  await page.reload();
  await page.waitForSelector('#doc h1');
  await page.waitForSelector('#doc .mermaid-diagram svg', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  return page;
}

const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 82, ...opts });
const want = (name) => !only || only.includes(name);
const panes = { sidebarOpen: true, panelOpen: true, panelTab: 'outline' };

const ctx = await launch('en-US');

for (const theme of ['light', 'dark']) {
  if (!want('hero')) break;
  const page = await open(ctx, 'launch-plan.md', { settings: { theme }, layout: panes });
  await shot(page, `hero-${theme}`);
  await page.close();
}

if (want('diagrams')) {
  const page = await open(ctx, 'launch-plan.md', { settings: { theme: 'light' }, layout: { ...panes, panelOpen: false } });
  await page.evaluate(() => document.querySelector('#doc h2').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await shot(page, 'diagrams');
  await page.close();
}

if (want('review')) {
  const rctx = await launch('en-US');
  const page = await open(rctx, 'launch-plan.md', { settings: { theme: 'light' }, layout: { ...panes, sidebarOpen: false, panelTab: 'comments' } });
  await page.evaluate(() => {
    const { review } = window.__markcraft;
    // Selects from the start of `from` to the end of `to` inside el (both within one text node).
    const select = (el, from, to) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode()) && !node.textContent.includes(from));
      const r = document.createRange();
      r.setStart(node, node.textContent.indexOf(from));
      r.setEnd(node, node.textContent.indexOf(to) + to.length);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    };
    const p = [...document.querySelectorAll('#doc p')];
    const intro = p.find((x) => x.textContent.startsWith('Atlas 2.0 brings'));
    select(intro, 'the success metrics', 'success metrics');
    review.annotate('highlight', 'yellow');
    const beta = p.find((x) => x.textContent.startsWith('The beta opens'));
    select(beta, 'followed by', 'two weeks later');
    review.annotate('highlight', 'green');
    const so = p.find((x) => x.textContent.startsWith('so cutting churn'));
    select(so, 'so cutting churn', 'so cutting churn');
    review.annotate('underline');
    const li = [...document.querySelectorAll('#doc ol li')][0];
    select(li, 'merge automatically', 'merge automatically');
    review.annotate('comment');
    document.querySelector('#composer textarea').value = 'Let’s decide this in Thursday’s sync — leaning automatic.';
    review.commitComposer();
    select(intro, 'real-time collaboration', 'real-time collaboration');
    review.annotate('comment');
    document.querySelector('#composer textarea').value = 'Link to the collaboration spec here?';
    review.commitComposer();
    getSelection().removeAllRanges();
    document.querySelector('#doc h1').scrollIntoView();
  });
  await page.waitForTimeout(500);
  await shot(page, 'review');
  await rctx.close();
}

if (want('edit')) {
  const page = await open(ctx, 'launch-plan.md', { settings: { theme: 'light' }, layout: { ...panes, panelOpen: false } });
  await page.evaluate(() => window.__markcraft.setMode('edit'));
  await page.waitForSelector('#editor .ProseMirror', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot(page, 'edit');
  await page.close();
}

if (want('present')) {
  const page = await open(ctx, 'keynote.md', { settings: { theme: 'light', presFont: 'humanist', presBackground: '#16152b', presHeading: '#c4b5fd', presText: '#e6e6f5', presAccent: '#8b5cf6' } });
  await page.evaluate(() => document.querySelector('#actions-menu [data-act="present"]').click());
  await page.click('#modal button[value="go"]', { timeout: 1500 }).catch(() => {});
  await page.waitForSelector('.present .slide h1, .present .slide h2');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  await shot(page, 'present');
  await page.close();
}

if (want('mindmap')) {
  const page = await open(ctx, 'roadmap.md', { settings: { theme: 'light' } });
  await page.evaluate(() => document.querySelector('#actions-menu [data-act="mindmap"]').click());
  await page.click('#modal button[value="go"]', { timeout: 1500 }).catch(() => {});
  await page.waitForSelector('.mindmap-view svg g circle', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot(page, 'mindmap');
  await page.close();
}

if (want('settings')) {
  const page = await open(ctx, 'launch-plan.md', { settings: { theme: 'light' }, layout: panes });
  await page.keyboard.press('ControlOrMeta+,');
  await page.waitForSelector('.st-tabs [data-tab="appearance"]');
  await page.click('.st-tabs [data-tab="appearance"]');
  await page.waitForTimeout(500);
  await shot(page, 'settings');
  await page.close();
}

await ctx.close();

// Social preview card (1200×630) composed from the logo and the hero screenshot.
if (want('og')) {
  const browser = await chromium.launch({ executablePath: process.env.CH || chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const site = 'file://' + path.join(root, 'site') + '/';
  const card = path.join(work, 'og.html');
  await writeFile(card, `<!doctype html><html><head><meta charset="utf-8"><base href="${site}"><style>
    body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: -apple-system, 'Inter', 'Segoe UI', sans-serif;
      background: radial-gradient(700px 400px at 15% 0%, rgba(99,102,241,.28), transparent 70%), radial-gradient(600px 400px at 90% 20%, rgba(139,92,246,.22), transparent 70%), #fafafc; color: #16161f; }
    .copy { position: absolute; left: 72px; top: 76px; width: 520px; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; }
    h1 { margin: 40px 0 0; font-size: 58px; line-height: 1.05; letter-spacing: -0.035em; font-weight: 750; }
    .g { background: linear-gradient(120deg, #4f46e5, #8b5cf6 60%, #c026d3); -webkit-background-clip: text; color: transparent; }
    p { margin: 24px 0 0; font-size: 23px; line-height: 1.45; color: #5f5f72; }
    .shot { position: absolute; left: 620px; top: 90px; width: 900px; border-radius: 16px; border: 1px solid #e6e6ee; box-shadow: 0 30px 80px -20px rgba(40,30,120,.35); }
  </style></head><body>
    <div class="copy"><div class="brand"><img src="assets/logo.svg" width="52" height="52">MarkCraft</div>
    <h1>Markdown,<br><span class="g">beautifully</span> read<br>in Chrome.</h1>
    <p>Diagrams, math, outline, annotations, editing, slides and export. Free &amp; open source.</p></div>
    <img class="shot" src="assets/screens/hero-light.jpg">
  </body></html>`);
  await page.goto('file://' + card);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(root, 'site/assets/og.png') });
  await browser.close();
}
console.log('screenshots →', path.relative(root, out));
