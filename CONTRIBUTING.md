# Contributing

Thanks for helping improve MarkCraft!

1. `npm install`, then `npm run watch` and load `dist/` as an unpacked extension.
2. Keep changes focused; match the surrounding code style (ES modules, no framework, plain DOM).
3. User-visible strings: add the English text where it is used and a Simplified Chinese entry in `src/shared/i18n.js`.
4. New settings: add a default in `src/shared/settings.js` and a field in the schema in `src/shared/settings-ui.js`.
5. Run `npm test` before opening a pull request, and add a check to `scripts/test.mjs` for new behavior.

## Secrets and third-party licenses

- Never commit API keys, credentials or private keys. Before pushing, run `gitleaks git --redact --log-opts="--all" .` with Gitleaks 8.30.1; CI runs the same scan. CI detects leaks after upload, so it does not replace a local check. If a real secret is exposed, revoke it first.
- When upgrading dependencies, run `npm run build` and review `dist/THIRD_PARTY_LICENSES.txt`. Missing license texts fail the build; verified upstream copies and their sources belong in `licenses/`, with version-specific mappings in `build.mjs`.
- Only contribute code and assets you have the right to distribute, and retain upstream copyright and license notices.
