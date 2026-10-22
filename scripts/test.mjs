// End-to-end smoke test: loads dist/ into Chromium and exercises the viewer.
// Usage: npm test   (optionally CH=/path/to/chrome to use a specific Chromium build)
import { chromium } from 'playwright';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ext = path.join(root, 'dist');
const work = await mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'mc-test-'));
await cp(path.join(root, 'test/fixtures'), work, { recursive: true });
const sample = path.join(work, 'sample.md');

// With a custom profile Chrome looks for native hosts inside the profile directory.
const profile = await mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'mc-profile-'));
const hostManifest = path.join(process.env.HOME, process.platform === 'darwin' ? 'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.markcraft.host.json' : '.config/google-chrome/NativeMessagingHosts/com.markcraft.host.json');
await cp(hostManifest, path.join(profile, 'NativeMessagingHosts/com.markcraft.host.json')).catch(() => {});
const ctx = await chromium.launchPersistentContext(profile, {
  headless: !process.env.HEADED,
  executablePath: process.env.CH || chromium.executablePath(),
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--lang=en-US'],
  viewport: { width: 1300, height: 900 },
  locale: 'en-US',
});
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
page.on('requestfailed', (r) => errors.push('requestfailed ' + r.url()));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('file://' + sample);
await page.waitForURL(/viewer\.html/, { timeout: 10000 }).catch(() => {});
check('file:// .md redirects to viewer', page.url().includes('viewer.html'), page.url());
await page.waitForSelector('#doc h1', { timeout: 10000 });
await page.waitForTimeout(1500);
if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'read.png') });

const info = await page.evaluate(() => ({
  h1: document.querySelector('#doc h1')?.textContent,
  toc: [...document.querySelectorAll('#toc .toc-item')].map((e) => e.textContent),
  hljs: !!document.querySelector('#doc .hljs-keyword'),
  katex: document.querySelectorAll('#doc .katex').length,
  mermaid: !!document.querySelector('#doc .mermaid-diagram svg'),
  mermaidErr: document.querySelector('.mermaid-error-msg')?.textContent,
  alert: !!document.querySelector('#doc .markdown-alert-note'),
  footnote: !!document.querySelector('#doc .footnotes'),
  tasks: document.querySelectorAll('#doc input[type=checkbox]').length,
  table: !!document.querySelector('#doc .table-wrap table'),
  frontMatter: !!document.querySelector('#doc details.front-matter'),
  img: document.querySelector('#doc img')?.src?.slice(0, 5),
  imgLoaded: document.querySelector('#doc img')?.naturalWidth,
  link: document.querySelector('#doc a[href*="other.md"]')?.href,
  graphviz: !!document.querySelector('#doc .graphviz-diagram svg'),
  wavedrom: !!document.querySelector('#doc .wavedrom-diagram svg'),
  plantumlNotice: !document.querySelector('#doc .plantuml-diagram') && !!document.querySelector('#doc code.language-plantuml'),
  diagErr: [...document.querySelectorAll('.diagram-error-msg:not(.notice-msg)')].map((e) => e.textContent).join(';'),
  rtl: [...document.querySelectorAll('#doc p')].some((p) => p.dir === 'auto' && getComputedStyle(p).direction === 'rtl'),
  stats: document.querySelector('#stats')?.textContent,
  sticky: getComputedStyle(document.querySelector('#doc thead th')).position,
  extIcon: getComputedStyle(document.querySelector('#doc a[target=_blank]'), '::after').content !== 'none',
  plugins: {
    sub: document.querySelector('#doc sub')?.textContent, sup: document.querySelector('#doc sup:not(.footnote-ref)')?.textContent,
    mark: document.querySelector('#doc mark')?.textContent, ins: document.querySelector('#doc ins')?.textContent,
    emoji: document.querySelector('#doc')?.textContent.includes('🚀'), abbr: document.querySelector('#doc abbr')?.title,
    dl: !!document.querySelector('#doc dl dt'), container: document.querySelector('#doc .container-tip .container-title')?.textContent,
    fm: !!document.querySelector('#doc .fm-card table'),
  },
  mint: {
    callout: !!document.querySelector('#doc .mint-note.mint-callout .mint-callout-body'),
    cards: document.querySelectorAll('#doc .mint-cardgroup .mint-card').length,
    cardLink: !!document.querySelector('#doc a.mint-card[href="https://example.com"]'),
    tabs: [...document.querySelectorAll('#doc .mint-tabs .mint-tabbar button')].map((b) => b.textContent).join(','),
    tabHidden: document.querySelectorAll('#doc .mint-tabs > .mint-tab[hidden]').length,
    steps: document.querySelectorAll('#doc .mint-steps .mint-step-title').length,
    accordion: document.querySelector('#doc details.mint-accordion summary')?.textContent,
    codegroup: [...document.querySelectorAll('#doc .mint-codegroup .mint-tabbar button')].map((b) => b.textContent).join(','),
  },
  diagErrTools: !!document.querySelector('#doc .diagram-error [data-diag="retry"]') && !!document.querySelector('#doc .diagram-error pre[hidden]'),
  files: [...document.querySelectorAll('#explorer .fx-row')].map((e) => e.textContent),
  title: document.title,
}));
check('renders heading', info.h1 === 'MarkCraft Sample');
check('outline lists headings', info.toc.length >= 8, info.toc.join(' | '));
check('syntax highlighting', info.hljs);
check('KaTeX math', info.katex >= 2, String(info.katex));
check('Mermaid diagram', info.mermaid, info.mermaidErr || '');
check('GitHub alert', info.alert);
check('footnotes', info.footnote);
check('task list checkboxes', info.tasks === 2);
check('table', info.table);
check('local image loads', info.img === 'blob:' && info.imgLoaded > 0, `${info.img} ${info.imgLoaded}`);
check('relative .md link → viewer', info.link?.includes('viewer.html?file='), info.link);
check('plugins: sub/sup/mark/ins/emoji/abbr/deflist/container', info.plugins.sub === '2' && info.plugins.mark === 'marked' && info.plugins.ins === 'inserted' && info.plugins.emoji && info.plugins.abbr === 'Hyper Text Markup Language' && info.plugins.dl && info.plugins.container === 'Pro tip', JSON.stringify(info.plugins));
check('front matter metadata card', info.plugins.fm);
check('Mintlify components', info.mint.callout && info.mint.cards === 2 && info.mint.cardLink && info.mint.tabs === 'One,Two' && info.mint.tabHidden === 1 && info.mint.steps === 2 && info.mint.accordion === 'Question?' && info.mint.codegroup === 'app.js,main.py', JSON.stringify(info.mint));
check('diagram error has Retry / Show source', info.diagErrTools);
check('Graphviz diagram', info.graphviz, info.diagErr);
check('WaveDrom diagram', info.wavedrom, info.diagErr);
check('PlantUML is opt-in (off by default)', info.plantumlNotice);
check('RTL paragraph auto-direction', info.rtl);
check('word count & reading time', /words · .* min read/.test(info.stats || ''), info.stats);
check('sticky table header', info.sticky === 'sticky');
check('external link indicator', info.extIcon);
check('file explorer lists .txt', info.files.includes('llms.txt'));
check('file explorer lists folder', info.files.includes('sample.md') && info.files.includes('sub'), info.files.join(','));

// Search in folder + bookmarks
await page.click('#dock [data-act="toggle-sidebar"]');
await page.click('[data-act="actions"]');
await page.click('#actions-menu [data-act="search-folder"]');
await page.fill('#fx-search', 'Back to');
await page.waitForSelector('#fx-results .sr-line', { timeout: 5000 }).catch(() => {});
check('search in folder finds other.md', (await page.textContent('#fx-results').catch(() => '')).includes('sub/other.md'));
await page.fill('#fx-search', '');
await page.dispatchEvent('#fx-search', 'input');
await page.click('[data-act="fx-more"]');
await page.click('#fx-more-menu [data-act="bookmark-folder"]');
await page.waitForTimeout(300);
check('folder bookmark added', (await page.textContent('#fx-star')) === '★');
await page.click('[data-act="bookmarks"]');
check('bookmark list shows folder', (await page.locator('#bookmarks .bm-row').count()) === 1);
await page.click('[data-act="bookmarks"]');
await page.click('#dock [data-act="toggle-sidebar"]');

// Diagram download dialog
await page.hover('#doc .graphviz-diagram');
await page.click('#doc .graphviz-diagram .diagram-dl');
check('diagram download dialog', await page.isVisible('.dl-modal'));
const dlP = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await page.click('.dl-modal [data-g="f"] [data-v="png"]');
await page.click('.dl-modal [data-go]');
const dlFile = await dlP;
check('diagram downloads as PNG', dlFile?.suggestedFilename() === 'graphviz.png', dlFile?.suggestedFilename());

// Sidebar grouping
await page.click('#dock [data-act="toggle-sidebar"]');
await page.click('[data-act="fx-sort"]');
await page.click('#fx-sort-menu [data-group="type"]');
await page.waitForSelector('#explorer .fx-group', { timeout: 4000 }).catch(() => {});
const groups = await page.$$eval('#explorer .fx-group', (g) => g.map((x) => x.textContent));
check('sidebar groups by type', groups.some((g) => g.startsWith('Markdown')) && groups.some((g) => g.startsWith('.txt')), groups.join(' | '));
await page.click('#fx-sort-menu [data-group="none"]').catch(async () => { await page.click('[data-act="fx-sort"]'); await page.click('#fx-sort-menu [data-group="none"]'); });
await page.keyboard.press('Escape');
await page.click('#dock [data-act="toggle-sidebar"]');

// Lightbox
await page.click('#doc img.zoomable');
check('image lightbox opens', await page.isVisible('.zoomer'));
await page.keyboard.press('Escape');
check('lightbox closes on Esc', !(await page.isVisible('.zoomer')));
await page.hover('#doc .graphviz-diagram');
await page.click('#doc .graphviz-diagram .diagram-zoom');
check('diagram fullscreen zoom', await page.isVisible('.zoomer svg'));
await page.keyboard.press('Escape');

// Word export
const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
await page.evaluate(() => document.querySelector('#actions-menu [data-act="export-docx"]').click());
await page.waitForSelector('#modal[open] .warn-list', { timeout: 3000 }).catch(() => {});
check('export warnings dialog (broken diagram)', (await page.textContent('#modal').catch(() => '')).includes('diagram'));
await page.click('#modal button[value="go"]').catch(() => {});
const download = await dl;
if (download) {
  const file = path.join(work, 'out.docx');
  await download.saveAs(file);
  const buf = await readFile(file);
  check('Word export produces .docx', download.suggestedFilename() === 'sample.docx' && buf.slice(0, 2).toString() === 'PK', `${buf.length} bytes`);
  const { execSync } = await import('node:child_process');
  const xml = execSync(`unzip -p "${file}" word/document.xml`).toString();
  const media = execSync(`unzip -l "${file}" | grep -c media/ || true`).toString().trim();
  check('docx contains text, table and images', xml.includes('MarkCraft Sample') && xml.includes('<w:tbl>') && +media >= 2, `media=${media}`);
} else check('Word export produces .docx', false, 'no download');

// Mind map
await page.evaluate(() => document.querySelector('#actions-menu [data-act="mindmap"]').click());
await page.waitForSelector('.mindmap-view svg g circle', { timeout: 10000 }).catch(() => {});
check('mind map renders', (await page.locator('.mindmap-view svg g circle').count()) > 3);
await page.waitForTimeout(1200);
if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'mindmap.png') });
await page.keyboard.press('Escape');

// Presentation
await page.evaluate(() => document.querySelector('#actions-menu [data-act="present"]').click());
await page.waitForSelector('#modal[open] .warn-list', { timeout: 3000 }).catch(() => {});
check('presentation warnings dialog', await page.isVisible('#modal .warn-list'));
await page.click('#modal button[value="go"]').catch(() => {});
await page.waitForSelector('.present .slide h1, .present .slide h2', { timeout: 5000 }).catch(() => {});
const count1 = await page.textContent('.present-count');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
const count2 = await page.textContent('.present-count');
check('presentation mode navigates slides', /^1 \/ \d+$/.test(count1) && count2.startsWith('2 /'), `${count1} → ${count2}`);
if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'present.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
if (await page.isVisible('.present')) await page.keyboard.press('Escape');
check('presentation exits', !(await page.isVisible('.present')));

// Find
await page.keyboard.press('ControlOrMeta+f');
await page.keyboard.type('searchterm');
await page.waitForTimeout(300);
check('find counts matches', (await page.textContent('.find-count')) === '1 / 2', await page.textContent('.find-count'));
await page.keyboard.press('Enter');
check('find steps to next', (await page.textContent('.find-count')) === '2 / 2');
await page.keyboard.press('Escape');

// External change → banner with diff
const orig = await readFile(sample, 'utf8');
await writeFile(sample, orig.replace('Intro paragraph', 'Changed intro paragraph'));
await page.waitForSelector('#banner:not([hidden])', { timeout: 5000 }).catch(() => {});
const bannerText = await page.textContent('#banner').catch(() => '');
check('external change shows diff banner', /changed on disk/.test(bannerText) && /\+1/.test(bannerText), bannerText.replace(/\s+/g, ' '));
await page.click('[data-act="ext-accept"]');
await page.waitForTimeout(400);
check('accept applies change', (await page.textContent('#doc p')).startsWith('Changed intro'));

// Task toggle marks dirty
await page.click('#doc input[type=checkbox] >> nth=0');
check('task toggle marks dirty', await page.isVisible('#dirty-dot'));
const st = await page.evaluate(() => window.__markcraft.S.text.includes('- [x] Unchecked task'));
check('task toggle edits source', st);

// Source mode
await page.evaluate(() => window.__markcraft.setMode('source'));
check('source mode shows markdown', (await page.inputValue('#source')).includes('# MarkCraft Sample'));

// Edit (WYSIWYG) mode
check('no errors in read mode', errors.length === 0, errors.slice(0, 5).join(' || '));
const readErrors = errors.length;
await page.evaluate(() => window.__markcraft.setMode('read'));
await page.click('#dock [data-act="toggle-edit"]');
await page.waitForSelector('#editor .ProseMirror', { timeout: 15000 }).catch(() => {});
const editorOk = await page.evaluate(() => !!document.querySelector('#editor .ProseMirror h1'));
check('WYSIWYG editor loads', editorOk);
if (editorOk) {
  await page.click('#editor .ProseMirror h1');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Typed heading');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Some **bold** text');
  await page.waitForTimeout(400);
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'edit.png') });
  const md = await page.evaluate(() => window.__markcraft.S.text);
  check('typing markdown syntax creates heading', /## Typed heading/.test(md));
  check('inline **bold** input rule', /\*\*bold\*\*/.test(md), md.split('\n').find((l) => l.includes('Some')));
}

// Review comment
await page.evaluate(() => window.__markcraft.setMode('read'));
await page.waitForTimeout(500);
await page.evaluate(() => {
  const p = [...document.querySelectorAll('#doc p')].find((x) => x.textContent.includes('Final paragraph'));
  const r = document.createRange();
  r.setStart(p.firstChild, 0);
  r.setEnd(p.firstChild, 15);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
});
await page.keyboard.press('ControlOrMeta+Shift+r');
await page.waitForSelector('#composer:not([hidden])', { timeout: 2000 }).catch(() => {});
check('comment composer opens', await page.isVisible('#composer'));
await page.keyboard.type('Make this punchier');
await page.keyboard.press('ControlOrMeta+Enter');
await page.waitForTimeout(300);
const prompt = await page.evaluate(() => window.__markcraft.review.buildPrompt('sample.md'));
check('comment saved & prompt built', prompt.includes('Final paragraph') && prompt.includes('Make this punchier'));

// Highlight annotation via the selection toolbar
await page.evaluate(() => {
  const h = [...document.querySelectorAll('#doc h3')].find((x) => x.textContent === 'Deep heading');
  h.scrollIntoView({ block: 'center' });
  const r = document.createRange();
  r.selectNodeContents(h);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
});
await page.waitForSelector('#selection-fab:not([hidden])', { timeout: 2000 }).catch(() => {});
await page.click('#selection-fab [data-color="green"]').catch(() => {});
await page.waitForTimeout(200);
const anno = await page.evaluate(() => ({ n: window.__markcraft.review.items.filter((i) => i.kind === 'highlight' && i.color === 'green').length, hl: CSS.highlights.has('anno-green') }));
check('highlight annotation from selection toolbar', anno.n === 1 && anno.hl);
const exported = await page.evaluate(async () => {
  const d = document.createElement('div');
  d.innerHTML = document.querySelector('#doc').innerHTML;
  window.__markcraft.review.applyTo(d);
  return d.querySelectorAll('mark.anno-green, mark.anno-comment').length;
});
check('annotations baked into exports', exported >= 2, String(exported));

// Save via native host if installed, else skip
const host = await page.evaluate(() => window.__markcraft.native.ping(true));
if (host) {
  await page.keyboard.press('ControlOrMeta+s');
  await page.waitForTimeout(800);
  check('save writes file (native host)', (await readFile(sample, 'utf8')).includes('## Typed heading'));
} else console.log('- native host not installed; skipping save test');

// Navigate via relative link
await page.click('#doc a[href*="other.md"]');
await page.waitForSelector('#doc h1:text("Other document")', { timeout: 5000 }).catch(() => {});
check('relative link opens other doc in-app', (await page.textContent('#doc h1')) === 'Other document');

// .txt rendered as Markdown
const p2 = await ctx.newPage();
await p2.goto('file://' + path.join(work, 'llms.txt'));
await p2.waitForSelector('#doc h1', { timeout: 8000 }).catch(() => {});
check('.txt rendered as Markdown', (await p2.textContent('#doc h1').catch(() => '')) === 'llms.txt');
await p2.close();

// Settings modal: toggle a plugin and a layout option
await page.keyboard.press('ControlOrMeta+,');
await page.waitForSelector('#settings-modal[open] .st-tabs', { timeout: 3000 }).catch(() => {});
check('quick settings opens (⌘,)', await page.isVisible('#settings-modal .st-tabs'));
await page.click('.st-tabs [data-tab="plugins"]');
await page.click('.st-body input[data-plugin="emoji"]', { force: true });
await page.waitForTimeout(300);
const emojiOff = await page.evaluate(() => window.__markcraft.S.settings.plugins.emoji === false);
check('plugin toggle saves', emojiOff);
await page.click('.st-body input[data-plugin="emoji"]', { force: true });
await page.click('.st-tabs [data-tab="appearance"]');
await page.click('.st-body .segment[data-key="layout"] [data-v="full"]');
await page.waitForTimeout(300);
check('layout setting applies', await page.evaluate(() => document.body.classList.contains('layout-full')));
await page.click('.st-body .segment[data-key="layout"] [data-v="centered"]');
await page.click('.st-close');

// Chinese UI
const p3 = await ctx.newPage();
await p3.goto('file://' + sample);
await p3.waitForSelector('#doc h1', { timeout: 8000 });
await p3.evaluate(() => chrome.storage.sync.get('settings').then(({ settings }) => chrome.storage.sync.set({ settings: { ...settings, language: 'zh-CN' } })));
await p3.reload();
await p3.waitForSelector('#doc h1', { timeout: 8000 });
const zh = await p3.evaluate(() => ({ read: document.querySelector('#mode-switch [data-mode="read"]').textContent, outline: document.querySelector('.pane-title').textContent, h1: document.querySelector('#doc h1').textContent }));
check('Chinese UI (content untouched)', zh.read === '阅读' && zh.outline === '大纲' && zh.h1 === 'MarkCraft Sample', JSON.stringify(zh));
if (process.env.SHOTS) await p3.screenshot({ path: path.join(process.env.SHOTS, 'zh.png') });
await p3.close();

await page.screenshot({ path: path.join(work, 'screenshot.png') });
if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'other.png') });
// Crepe paints relative inline images once before we can swap in the resolved URL.
const later = errors.slice(readErrors).filter((e) => !/ERR_FILE_NOT_FOUND|requestfailed chrome-extension:\/\/[^/]+\/img\//.test(e));
check('no unexpected page errors', later.length === 0, later.slice(0, 5).join(' || '));
console.log(`\n${failures ? failures + ' failed' : 'all passed'} — workdir ${work}`);
await ctx.close();
process.exit(failures ? 1 : 0);
