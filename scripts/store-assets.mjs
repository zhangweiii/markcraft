// Generates every image the Chrome Web Store listing needs, from the assets
// that already live in the repo. Output goes to store-assets/ (git-ignored).
//
//   npm run store-assets
//
// Requires: `npx playwright install chromium` (already needed for `npm test`)
// and, on macOS/Linux, `sips`/`sips`-less fallback is handled below.

import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const OUT = 'store-assets';
const SHOTS = `${OUT}/screenshots`;

const hasSips = await run('sips', ['--version']).then(() => true, () => false);

await rm(OUT, { recursive: true, force: true });
await mkdir(SHOTS, { recursive: true });

// ---------------------------------------------------------------- screenshots
// CWS accepts 1280x800 (or 640x400). The site screens are 2880x1800 — exactly 8:5,
// so a straight downscale never distorts. Upload at most five.
const PICK = ['hero-light', 'hero-dark', 'diagrams', 'edit', 'review', 'present', 'mindmap', 'settings'];
for (const name of PICK) {
  const src = `site/assets/screens/${name}.jpg`;
  const dst = `${SHOTS}/${name}.jpg`;
  if (hasSips) {
    await run('sips', ['-Z', '1280', '-s', 'format', 'jpeg', '-s', 'formatOptions', '90', src, '--out', dst]);
  } else {
    await cp(src, dst);
    console.warn(`! sips not found — ${dst} left at its original size, resize it to 1280x800 yourself`);
  }
}

// Store icon = the manifest icon, unchanged.
await cp('src/static/icons/128.png', `${OUT}/icon-128.png`);

// ------------------------------------------------------------- promo tiles
const logo = await readFile('site/assets/logo.svg', 'utf8');
const font = `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`;

/** Shared shell: dark canvas, soft indigo/violet glows, faint markdown glyphs. */
const shell = (w, h, body, scale = 1) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${w}px;height:${h}px;overflow:hidden}
  body{position:relative;display:flex;align-items:center;justify-content:center;
       background:#07070b;color:#fff;font-family:${font};-webkit-font-smoothing:antialiased}
  .glow{position:absolute;border-radius:50%;filter:blur(${Math.round(h / 4)}px)}
  .g1{width:${w * 0.7}px;height:${w * 0.7}px;left:${-w * 0.2}px;top:${-h * 0.75}px;
      background:radial-gradient(circle,#4f46e5 0%,transparent 68%);opacity:.55}
  .g2{width:${w * 0.6}px;height:${w * 0.6}px;right:${-w * 0.15}px;bottom:${-h * 0.7}px;
      background:radial-gradient(circle,#7c3aed 0%,transparent 68%);opacity:.5}
  .grid{position:absolute;inset:0;opacity:.16;
      background-image:linear-gradient(#fff1 1px,transparent 1px),linear-gradient(90deg,#fff1 1px,transparent 1px);
      background-size:${Math.round(48 * scale)}px ${Math.round(48 * scale)}px;
      mask-image:radial-gradient(ellipse at 50% 45%,#000 20%,transparent 78%)}
  .logo{display:block;filter:drop-shadow(0 ${Math.round(16 * scale)}px ${Math.round(40 * scale)}px rgba(79,70,229,.55))}
  .title{font-weight:700;letter-spacing:-.035em;line-height:1;
      background:linear-gradient(115deg,#ffffff 0%,#dfe0ff 55%,#b9b9ff 100%);
      -webkit-background-clip:text;background-clip:text;color:transparent}
  .tag{color:#9d9db4;font-weight:450;letter-spacing:-.01em}
  .pills{display:flex;gap:${Math.round(10 * scale)}px}
  .pill{display:flex;align-items:center;gap:${Math.round(7 * scale)}px;padding:${Math.round(7 * scale)}px ${Math.round(14 * scale)}px;
      border-radius:999px;background:#ffffff0f;border:1px solid #ffffff1a;
      font-size:${Math.round(13 * scale)}px;font-weight:550;color:#c9c9dd;letter-spacing:-.005em}
  .pill b{color:#a5a6ff;font-weight:600}
</style></head><body>
  <div class="glow g1"></div><div class="glow g2"></div><div class="grid"></div>
  ${body}
</body></html>`;

// 440x280 — small promo tile (shown in store category/home slots).
const smallTile = shell(440, 280, `
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:14px">
    <div class="logo" style="width:76px;height:76px">${logo}</div>
    <div class="title" style="font-size:37px">MarkCraft</div>
    <div class="tag" style="font-size:14.5px;margin-top:-4px">Markdown viewer &amp; editor for Chrome</div>
    <div class="pills" style="margin-top:6px">
      <span class="pill">Free &amp; open source</span>
      <span class="pill"><b>100%</b> local</span>
    </div>
  </div>`);

// 1400x560 — marquee tile (store home carousel).
const marquee = shell(1400, 560, `
  <div style="position:relative;display:flex;align-items:center;gap:64px;padding:0 84px;width:100%">
    <div style="display:flex;flex-direction:column;gap:20px;max-width:640px">
      <div class="logo" style="width:96px;height:96px">${logo}</div>
      <div class="title" style="font-size:76px;margin-top:6px">MarkCraft</div>
      <div class="tag" style="font-size:23px;line-height:1.35;margin-top:-8px">
        Read, edit, review and present Markdown<br>right inside Chrome.
      </div>
      <div class="pills" style="margin-top:10px">
        <span class="pill">Mermaid &amp; KaTeX</span>
        <span class="pill"><b>PDF</b> / Word export</span>
        <span class="pill">Free &amp; open source</span>
      </div>
    </div>
    <div style="flex:1;display:flex;justify-content:flex-end">
      <div style="width:430px;border-radius:16px;background:#0e0e15;border:1px solid #ffffff1f;
                  box-shadow:0 40px 90px -30px rgba(0,0,0,.9),0 0 0 1px #ffffff08;overflow:hidden">
        <div style="display:flex;align-items:center;gap:7px;padding:13px 15px;border-bottom:1px solid #ffffff12;background:#ffffff06">
          <span style="width:10px;height:10px;border-radius:50%;background:#ff5f57"></span>
          <span style="width:10px;height:10px;border-radius:50%;background:#febc2e"></span>
          <span style="width:10px;height:10px;border-radius:50%;background:#28c840"></span>
          <span style="margin-left:10px;font:11px/1 ui-monospace,Menlo,monospace;color:#6f6f85">README.md</span>
        </div>
        <div style="padding:22px 24px;display:flex;flex-direction:column;gap:11px">
          <div style="height:17px;width:58%;border-radius:5px;background:linear-gradient(90deg,#ffffffdd,#c9c9f0)"></div>
          <div style="height:8px;width:100%;border-radius:4px;background:#ffffff1c"></div>
          <div style="height:8px;width:92%;border-radius:4px;background:#ffffff1c"></div>
          <div style="height:8px;width:78%;border-radius:4px;background:#ffffff1c"></div>
          <div style="margin-top:6px;height:74px;border-radius:10px;background:#14142a;border:1px solid #8b8cff33;
                      display:flex;align-items:center;justify-content:center;gap:14px">
            <div style="width:38px;height:38px;border-radius:9px;border:2px solid #8b8cff;opacity:.85"></div>
            <div style="width:26px;height:2px;background:#8b8cff;opacity:.55"></div>
            <div style="width:38px;height:38px;border-radius:50%;border:2px solid #a78bfa;opacity:.85"></div>
            <div style="width:26px;height:2px;background:#a78bfa;opacity:.55"></div>
            <div style="width:38px;height:38px;border-radius:9px;border:2px dashed #c4b5fd;opacity:.8"></div>
          </div>
          <div style="height:8px;width:84%;border-radius:4px;background:#ffffff1c"></div>
          <div style="height:8px;width:64%;border-radius:4px;background:#ffffff1c"></div>
        </div>
      </div>
    </div>
  </div>`);

// --------------------------------------------------------------- render
// Playwright's pinned build may not be downloaded yet; fall back to any browser
// we can find locally instead of forcing a 150 MB download just for two images.
async function launch() {
  const attempts = [
    () => chromium.launch(),
    () => chromium.launch({ channel: 'chrome' }),
    () => chromium.launch({ channel: 'msedge' }),
  ];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch {}
  }
  throw new Error('No Chromium found. Run: npx playwright install chromium');
}

const browser = await launch();

// Render each tile at 3x then downscale with sips for clean edges.
for (const [html, w, h, name] of [
  [smallTile, 440, 280, 'promo-440x280'],
  [marquee, 1400, 560, 'promo-1400x560'],
]) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3 });
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const raw = `${OUT}/.${name}.3x.png`;
  await p.screenshot({ path: raw });
  await p.close();
  if (hasSips) {
    await run('sips', ['-z', String(h), String(w), raw, '--out', `${OUT}/${name}.png`]);
    await rm(raw);
  } else {
    await cp(raw, `${OUT}/${name}.png`);
    await rm(raw);
    console.warn(`! sips not found — ${name}.png is 3x, resize to ${w}x${h} yourself`);
  }
}
await browser.close();

console.log(`\nWrote ${OUT}/`);
console.log(`  icon-128.png             (128x128, store icon)`);
console.log(`  promo-440x280.png        (small promo tile)`);
console.log(`  promo-1400x560.png       (marquee tile)`);
console.log(`  screenshots/*.jpg        (${PICK.length} at 1280x800 — upload 5, see PUBLISH.md)`);
