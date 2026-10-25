// Zips dist/ into markcraft.zip for the Chrome Web Store. Run after build.mjs:
//
//   npm run package
//
// dist/ keeps the manifest `key` so an unpacked dev build has the fixed id the native
// helper trusts. The store rejects packages that carry a `key` and assigns its own id,
// so the zip gets a copy of the manifest without it. The package is also checked for
// files that must never ship (private keys, source maps, local helper config).
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const zipPath = path.join(root, 'markcraft.zip');
const FORBIDDEN = [/\.pem$/i, /\.map$/i, /(^|\/)config\.json$/, /(^|\/)\.DS_Store$/, /(^|\/)\.env/];

const work = await mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'mc-pkg-'));
try {
  await cp(path.join(root, 'dist'), work, { recursive: true });

  const manifestPath = path.join(work, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.key;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const files = (await readdir(work, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => path.relative(work, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
  const bad = files.filter((f) => FORBIDDEN.some((re) => re.test(f)));
  if (bad.length) throw new Error(`Refusing to package: ${bad.join(', ')}`);

  await rm(zipPath, { force: true });
  await run('zip', ['-qrX', zipPath, '.'], { cwd: work });
  console.log(`markcraft.zip — version ${manifest.version}, ${files.length} files, no manifest key`);
} finally {
  await rm(work, { recursive: true, force: true });
}
