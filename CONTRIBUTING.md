# Contributing

Thanks for helping improve MarkCraft!

1. `npm install`, then `npm run watch` and load `dist/` as an unpacked extension.
2. Keep changes focused; match the surrounding code style (ES modules, no framework, plain DOM).
3. User-visible strings: add the English text where it is used and a Simplified Chinese entry in `src/shared/i18n.js`.
4. New settings: add a default in `src/shared/settings.js` and a field in the schema in `src/shared/settings-ui.js`.
5. Run `npm test` before opening a pull request, and add a check to `scripts/test.mjs` for new behavior.
