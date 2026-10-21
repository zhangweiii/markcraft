import * as esbuild from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const out = 'dist';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp('src/static', out, { recursive: true });

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
  { ...common, entryPoints: { background: 'src/background.js', popup: 'src/popup.js', options: 'src/options.js' }, outdir: out, format: 'esm' },
  { ...common, entryPoints: { detect: 'src/detect.js' }, outdir: out, format: 'iife' },
];

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}

const manifest = JSON.parse(await readFile('src/manifest.json', 'utf8'));
manifest.version = JSON.parse(await readFile('package.json', 'utf8')).version;
await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
