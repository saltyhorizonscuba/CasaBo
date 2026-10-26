# Multilingual build

English pages at the repo root are the source. `fr/` and `es/` are generated, do not edit them.

1. Edit the English page (or `tools/i18n/*.json` for `data-i18n` keys, `tools/i18n/strings.json` for plain text, `tools/i18n/meta.json` for titles and descriptions).
2. `node tools/cache-bust.js <version>` (optional), then `node tools/build-i18n.js`.
3. `node tools/build-i18n.js --extract` lists English strings that still have no translation (written to `tools/i18n/todo.json`).
4. Commit the root pages, `fr/` and `es/` together.

Setup once: `cd tools && npm install`.
