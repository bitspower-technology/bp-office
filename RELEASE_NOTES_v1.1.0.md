# BP Office 1.1.0

BP Office is the endpoint-only OEM edition published by Bitspower Technology: an
OpenAI-compatible **Endpoint** is the single AI connection, there is no ChatGPT
subscription path, and nothing talks to a vendor cloud. This release replaces
1.0.x and is delivered for **Windows x64 only**.

## What's new

### A new HTML workspace

HTML files now open in their own editor with a CodeMirror source view, a live preview, and a
presentation view, hosted as a normal BP Office tab alongside Docs, Sheets, PDF, and Markdown.
`.html` and `.htm` are registered for the shell, and the file-association icon matches the
other document types.

### Spreadsheet rendering and formulas

The native workbook engine was rewritten around an explicit visual layer: charts, sparklines,
cell images, table styles, conditional formatting, data validation, and defined names are read
from the file and drawn instead of being flattened. Row-height auto-fit respects wrapped text
and line pitch, borders no longer bleed past a selection, and merged-cell editing is reachable
from the AI panel. The formula library gained the functions that upstream added in this cycle.

### Document authoring

Docs gained the dialogs people expect from a word processor: font, field, list, paper size,
page setup, and autocorrect settings, an AI side for comments, revisions, styles, tables,
floating objects, and note operations, page thumbnails in the navigation pane, and lazy media
inlining so large documents open without loading every embedded picture first.

### Upstream integration

BP Office 1.1 is built on the NiuOffice OEM snapshot `0.10.1467-niu.1` (upstream GenOffice
`v0.10.1467`). BP Office identity wins everywhere a name is visible or persisted: product and
AI names, application/executable/desktop identifiers, the user-data directory, the artifact
names, the update feed repository, and the icons. Upstream takes precedence for shared engine
work, including the per-language Docs translation shards and the endpoint request helpers. The
unsolicited star-prompt card stays removed, and BP's "answer without hidden reasoning" request
hint plus its HTTP 400 retry are preserved on all three protocol adapters (OpenAI-compatible,
Anthropic, Gemini).

## Versioning

Releases move from `1.0.x-bp.N` to plain semver. The retired `-bp.N` prereleases compare lower
than `1.1.0`, so an internal 1.0 install updates forward to this build normally.

## Installation and signing

- `BPOffice-Setup-1.1.0.exe` is a per-user NSIS installer: no administrator rights needed, and
  settings live in `%APPDATA%\BPOffice`, which an upgrade preserves.
- `BPOffice-Portable-1.1.0.exe` runs without installing; portable builds never self-update.
- Both are **unsigned**: Bitspower Technology has not provisioned a Windows code signing
  certificate yet. Windows SmartScreen shows "The publisher could not be verified" on first
  launch - choose **More info** then **Run**. Browsers warn in the same way when downloading
  (`More options` then `Keep`). Auto-update over the public feed is otherwise enabled.

## Privacy and removed features

AI requests go only to the endpoint you configure, and every request requires your own bearer
key; no BP Office or vendor account exists. Slides, network AI Search, cloud login and media
search, analytics, external MCP endpoints, headless export mode, and any automation CLI are not
shipped - the release gates and the packaged-application audit fail if they reappear. Local
Find, workbook inspection, ordinary editing, and PDF conversion remain available.

## Verification for this build

- `npm run check:product-boundaries`, `check:oem-boundaries`, `format:check`,
  `check:theme-colors`, `check:english-comments`, `lint` (0 errors), and `typecheck`: all pass.
- `npm test` on Node 22: every workspace passes with no failures (a small number of tests are
  skipped by design).
- `npm run dist:win` then `tools/audit-release.mjs`: the packaged application contains the five
  editors, the xlsx sidecar, `pdfium.wasm`, `hb-subset.wasm`, the Windows OCR helper and the
  license files, and none of the removed surfaces.

## Known limitations

- Two end-to-end specs inherited from upstream are intermittent under CI's headful Electron run
  (a Sheets focus/typing case and a Docs mirrored-margins case); both pass on re-run, and the
  underlying spreadsheet typing/save-path weakness is recorded as unresolved in the upstream
  handoff. Normal editing is not affected.
- Windows only: no Linux AppImage or RPM is built, published, or supported for BP Office.
- Unsigned binaries draw SmartScreen and browser download warnings until a certificate is
  provisioned.
