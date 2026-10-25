import * as esbuild from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const out = 'dist';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp('src/static', out, { recursive: true });
// highlight.js themes offered in Settings → Appearance → Syntax Theme.
await mkdir(`${out}/hljs`, { recursive: true });
for (const theme of ['github', 'github-dark', 'atom-one-light', 'atom-one-dark', 'vs', 'vs2015', 'monokai', 'nord', 'tokyo-night-dark', 'stackoverflow-light', 'xcode']) {
  await cp(`node_modules/highlight.js/styles/${theme}.min.css`, `${out}/hljs/${theme}.min.css`);
}

const common = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  target: 'chrome110',
  logLevel: 'info',
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'dataurl' },
  assetNames: 'assets/[name]-[hash]',
};

const builds = [
  // Main viewer app: ESM with code splitting so heavy libs (mermaid, editor) load lazily.
  { ...common, entryPoints: { viewer: 'src/viewer/main.js', 'viewer-style': 'src/viewer/style.css', 'editor-style': 'src/viewer/editor.css', 'content-style': 'src/viewer/content.css' }, outdir: out, format: 'esm', splitting: true, chunkNames: 'chunks/[name]-[hash]' },
  { ...common, entryPoints: { background: 'src/background.js', popup: 'src/popup.js', options: 'src/options.js', 'popup-style': 'src/popup.css', 'options-style': 'src/options.css' }, outdir: out, format: 'esm' },
  { ...common, entryPoints: { detect: 'src/detect.js' }, outdir: out, format: 'iife' },
];

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  const results = await Promise.all(builds.map((b) => esbuild.build({ ...b, metafile: true })));
  await writeNotices(results.flatMap((r) => Object.keys(r.metafile.inputs)));
}

// Collects the license text of every npm package that ended up in the bundles (plus the
// highlight.js themes copied above) into THIRD_PARTY_LICENSES.txt, as their licenses
// require when the extension is distributed.
async function writeNotices(inputs) {
  const roots = new Set(['node_modules/highlight.js']);
  for (const file of inputs) {
    const m = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(file);
    if (m) roots.add(m[1]);
  }
  const entries = [];
  for (const root of roots) {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const files = (await readdir(root)).filter((f) => /^(licen[cs]e|copying|notice)/i.test(f)).sort();
    const texts = await Promise.all(files.map((f) => readFile(path.join(root, f), 'utf8')));
    const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || 'see package';
    // The source location also covers licenses such as EPL-2.0 that require saying where to get it.
    const repo = String(pkg.repository?.url || pkg.repository || '').replace(/^git\+/, '');
    const text = texts.join('\n\n').trim() || `License: ${license} (no license file in the package)`;
    entries.push({ id: `${pkg.name}@${pkg.version}`, license, text: repo ? `Source: ${repo}\n\n${text}` : text });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const lines = ['MarkCraft bundles the following third-party packages.', ''];
  for (const e of entries) lines.push('='.repeat(78), `${e.id} — ${e.license}`, '='.repeat(78), e.text, '');
  await writeFile(`${out}/THIRD_PARTY_LICENSES.txt`, lines.join('\n'));
}

const manifest = JSON.parse(await readFile('src/manifest.json', 'utf8'));
manifest.version = JSON.parse(await readFile('package.json', 'utf8')).version;
await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
