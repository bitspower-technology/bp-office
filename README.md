# BP-Office

**The world's first full-featured open-source AI Office suite.**

[![License: Apache-2.0](https://img.shields.io/github/license/BP-Arnaud/bp-office)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/BP-Arnaud/bp-office)](https://github.com/BP-Arnaud/bp-office/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/BP-Arnaud/bp-office/total)](https://github.com/BP-Arnaud/bp-office/releases)
[![GitHub stars](https://img.shields.io/github/stars/BP-Arnaud/bp-office?style=flat)](https://github.com/BP-Arnaud/bp-office/stargazers)
![Platforms: macOS | Windows | Linux](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

BP-Office is a free, open-source office suite for macOS, Windows, and Linux,
built around AI editing as a first-class workflow rather than a bolted-on chat
box. It opens and saves Word (`.docx`) and Excel (`.xlsx`) files, and edits PDF
and Markdown too: a word processor, spreadsheet, PDF editor, and Markdown
editor in one tabbed desktop application.

## Features

- **Real PDF editing** — retype text and edit images in the page itself, original fonts preserved.
- **Microsoft Word–compatible, byte-preserving `.docx` editing** — only what you touched changes; Word never notices.
- **Word-faithful pagination** — page breaks land where Word puts them.
- **Excel-compatible spreadsheets** — in-house engine with a Rust `.xlsx` sidecar, own charts, pivot tables, slicers.
- **Markdown to Word, fully local** — the same OOXML engine, no Pandoc, no cloud.
- **AI that edits documents** — block-level edits with snapshots and diffs, document-aware agents.
- **Agent tools built in** — web and image search with document-aware editing tools.
- **Light / dark / system themes.**
- **macOS, Windows, Linux.**
- **Free & open-source (Apache-2.0).**

## Download

Download the latest published build from the
[BP-Office Releases](https://github.com/BP-Arnaud/bp-office/releases) page.

| Platform                             | Requirements                                          | Artifact name                      |
| ------------------------------------ | ----------------------------------------------------- | ---------------------------------- |
| **macOS** — Apple Silicon (arm64)    | macOS 11+                                             | `BP-Office-<version>-arm64.dmg`    |
| **macOS** — Intel (x64)              | macOS 11+                                             | `BP-Office-<version>.dmg`          |
| **Windows installer** (x64)          | Windows 10+                                           | `BP-Office Setup <version>.exe`    |
| **Windows portable** (x64)           | Windows 10+                                           | `BP-Office Portable <version>.exe` |
| **Linux** — Debian / Ubuntu          | x86_64, glibc 2.34+ (Ubuntu 22.04 or newer)           | `bpoffice_<version>_amd64.deb`    |
| **Linux** — Fedora / RHEL / openSUSE | x86_64, glibc 2.34+ (Fedora 35+, RHEL 9+, Leap 15.6+) | `bpoffice-<version>.x86_64.rpm`   |
| **Linux** — other distributions      | x86_64, glibc 2.34+, FUSE 2                           | `BP-Office-<version>.AppImage`     |

Published macOS and Windows installers are signed when release credentials
are available. Older versions remain on the Releases page.

### Installing on Linux

The deb installs with apt — it pulls in the dependencies and adds BP-Office
to the applications menu:

```bash
sudo apt install ./bpoffice_*_amd64.deb
```

On Fedora / RHEL-family / openSUSE, install the rpm instead:

```bash
sudo dnf install ./bpoffice-*.x86_64.rpm     # Fedora / RHEL family
sudo zypper install ./bpoffice-*.x86_64.rpm  # openSUSE
```

The AppImage instead runs in place: install the FUSE 2 runtime
(`sudo apt install libfuse2`; on Ubuntu 24.04 the package is `libfuse2t64`),
make the file executable, then run it:

```bash
chmod +x BP-Office-*.AppImage
./BP-Office-*.AppImage
```

## Apps

| App             | Product                | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/docs`     | **BP-Office Docs**     | `.docx` word processor. Byte-preserving round trip: only dirty paragraphs are regenerated (paragraph patch), everything else in the original file is kept byte-for-byte, so opening and saving never breaks layout in Word. Paginated view whose line metrics reproduce the original document's layout, tracked changes, comments, styles, equations, ink.                                                                                                                                                                                                      |
| `apps/sheets`   | **BP-Office Sheets**   | `.xlsx` spreadsheet. UI built on the open-source [Univer](https://github.com/dream-num/univer) core (Apache-2.0) with a large layer of in-house extensions; `.xlsx` import/export runs through an in-house Rust sidecar (calamine + IronCalc), charts are rendered in-house (Konva), plus pivot tables, slicers, conditional formatting, and formula tracing.                                                                                                                                                                                                   |
| `apps/pdf`      | **BP-Office PDF**      | `.pdf` viewer/editor on [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) + [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT): annotations, forms, outlines, stamps, signatures, page operations, and printing support. True text editing — paragraph selection with in-block reflow, alignment restoration, original-font preservation — and content-stream image insert/edit, all rewriting page content streams through [PDFium](https://pdfium.googlesource.com/pdfium/) wasm (BSD-3-Clause) with subset-embedded fonts — no cover-up annotations. |
| `apps/markdown` | **BP-Office Markdown** | `.md` / `.markdown` editor: Tiptap block editor over plain Markdown files — headings, lists, tables, images, code blocks — saved back as plain Markdown, hosted in shell tabs.                                                                                                                                                                                                                                                                                                                                                                                  |
| `apps/shell`    | **BP-Office**          | The suite shell: home screen, tabbed hosting of the four editors, light/dark/system theme, auto-update.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Every editor embeds the same AI panel: block-granular AI editing with version
snapshots and diffs in Docs, plus a tool-calling agent over workbook and PDF
state in the other structured editors.

The whole suite ships light / dark / system UI themes built on shared design
tokens (`packages/ui`), with a CI guard that keeps chrome colors on the token
system. Document surfaces stay light in dark mode — Word-style dark chrome
around white paper — so files render and export identically in both themes.

**Local AI backend (LM Studio).** BP-Office AI connects to an
[LM Studio](https://lmstudio.ai/) server on your computer through its
OpenAI-compatible API. The default endpoint is `http://127.0.0.1:1234/v1`;
you can change it, select a discovered model, and supply an optional LM Studio
API token under **Settings → Local AI**. No cloud sign-in is required.

Before using an AI panel, start LM Studio's local server and make at least one
LLM available. BP-Office AI prefers a loaded model that supports tool use,
then another loaded LLM, then the first available LLM. The status row in the
bottom-left corner shows whether the server is reachable and which model is
selected. Each request can use up to 200 tool-call rounds, and conversation
history compacts at roughly 256K tokens. To use that full history budget, load
the model in LM Studio with a 256K context window; a smaller model context takes
precedence. Web and image search remain available through Serper when configured,
with DuckDuckGo fallback; legacy cloud generation, conversion, and media
services are not part of this fork.

## Engine packages

All pure TypeScript, no Electron dependency, unit-tested (except the UI kit):

- `packages/docx-engine` — docx parsing → block tree (with `docxIndex`
  anchors and passthrough), OOXML fragment generation, byte-level paragraph
  patching.
- `packages/file-parse` — text extraction for AI attachments (office formats,
  text formats).
- `packages/agent-core` — the AI agent loop and skill composition shared by
  every app.
- `packages/ai-provider` — provider abstraction and streaming for the model
  backends.
- `packages/ai-search` — provider-independent web/image search tools.
- `packages/i18n`, `packages/ui`, `packages/project-store`,
  `packages/electron-utils` — shared i18n core, React UI kit, recent-files
  store, and Electron main-process helpers.

## Development

```bash
npm install
npm run fixtures     # generate test .docx fixtures
npm test             # unit tests across shipped and standalone source workspaces
npm run typecheck    # tsc --noEmit across every workspace
npm run dev          # the four shipped editors + shell against Vite dev servers
npm run dev:docs     # a single app (same pattern works per workspace)
npm run dist:mac     # package macOS dmg (regenerates third-party notices)
npm run dist:win     # package Windows installer + portable executable
npm run dist:linux   # package Linux AppImage + deb + rpm
```

The sheets app additionally needs a Rust toolchain for its xlsx sidecar
(`cargo` on PATH); `npm run build -w @genoffice/sheets` compiles it
automatically.

Local UI/e2e driver scripts (Playwright + Electron, for local acceptance, not
committed by default) live in [`scripts/drivers/`](scripts/drivers/README.md).

## Architecture notes (docx round trip)

```
open docx ─► archive original by hash (never touched)
          ─► docx-engine parses word/document.xml top-level elements (w:p / w:tbl / …)
          ─► Block tree, each block anchored by docxIndex + original XML slice
          ─► Tiptap streaming editor (manual + AI editing, dirty tracking)
save      ─► dirty blocks → OOXML fragments (referencing existing styles only)
          ─► splice into original document.xml (untouched blocks keep original bytes)
          ─► repack zip; all other entries copied byte-for-byte
```

The same philosophy holds in Sheets: the original file is the source of truth,
edits are applied as narrow patches, and everything the editor didn't touch
survives the round trip untouched.

## FAQ

**Is BP-Office free?**
Yes. BP-Office is free and open-source under the Apache-2.0 license — no
trial, no paid tier for the apps themselves.

**Can BP-Office open Microsoft Word and Excel files?**
Yes. BP-Office opens and saves native `.docx` and `.xlsx` files.
Saving is byte-preserving: parts of the file you didn't touch are written
back byte-for-byte, so documents keep working in Microsoft Office.

**Does BP-Office work offline?**
Document editing remains local. With the default endpoint, prompts and
attachments are sent only to LM Studio on your own computer; web and image
search still require network access. An optional LM Studio API token is stored
alongside the existing local AI settings.

**What happens to older GenOffice or Genspark data?**
BP-Office never reads the legacy Genspark authentication or cloud-project
files. They are left untouched during migration so uninstalling or upgrading
does not silently delete user data. If you no longer need them, you may
manually remove `~/.genoffice/auth.json` and `cloud-projects.json` from the
legacy GenOffice application-data directory after making any backup you want
to keep. The legacy path remains unchanged for upgrade compatibility.

**Can BP-Office edit PDF files?**
Yes — real PDF text and image editing that rewrites the page content stream
with the original fonts preserved, not cover-up annotations.

## Security

See [SECURITY.md](SECURITY.md) for the process security posture (renderer
sandboxing, IPC validation, external-link gating) and the threat models for
AI-generated content.

## Acknowledgements

BP-Office would not be possible without these open-source projects:

- [Electron](https://www.electronjs.org/) — the desktop runtime for every app.
- [Univer](https://github.com/dream-num/univer) (Apache-2.0) — the spreadsheet
  UI core that Sheets extends.
- [PDFium](https://pdfium.googlesource.com/pdfium/) (BSD-3-Clause, bundled via
  [@embedpdf/pdfium](https://github.com/embedpdf/embed-pdf-viewer)) — the
  content-stream engine behind true PDF text and image editing.
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) and
  [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT) — PDF rendering and
  document assembly.
- [Tiptap](https://tiptap.dev/) / [ProseMirror](https://prosemirror.net/) —
  the block editors in Docs and Markdown.
- [HarfBuzz](https://github.com/harfbuzz/harfbuzz) (wasm) — text-shaping
  metrics for complex scripts.
- [calamine](https://github.com/tafia/calamine) and
  [IronCalc](https://github.com/ironcalc/IronCalc) — the read and calc layers
  of the Rust xlsx sidecar.
- Liberation, Carlito, Caladea, and Noto CJK fonts (OFL/Apache-2.0) — bundled
  document fonts.

## Third-party notices

`npm run notices` regenerates the bundled third-party license summary
(`tools/gen-third-party-notices.mjs`); all runtime dependencies are
MIT/Apache-2.0/BSD-3-Clause/OFL, and the bundled fonts (Liberation, Carlito,
Caladea, Noto CJK subsets) are OFL/Apache.

## License

BP-Office is licensed under the [Apache License 2.0](LICENSE), with one
exception: the `ee/` directory is reserved for future enterprise modules and
retains its historical [GenOffice Enterprise License](ee/LICENSE).

BP-Office is derived from the upstream
[GenOffice](https://github.com/genspark-ai/genoffice) codebase; its copyright
and license history remains preserved.

The GenOffice and Genspark names and logos are trademarks of Mainfunc, Inc.
The Apache-2.0 license does not grant permission to use them (see section 6);
forks should use their own branding.
