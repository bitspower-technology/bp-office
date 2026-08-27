# BP-Office

![BP-Office logo](branding/bpoffice-gradient-outline.svg)

BP-Office is a free, open-source desktop office suite with local-first editing
and optional AI assistance. It works with Word (`.docx`), Excel (`.xlsx`,
`.xlsm`, `.xls`, `.csv`), PDF, and Markdown files and keeps those editors
together in one tabbed application.

[![License: Apache-2.0](https://img.shields.io/github/license/BP-Arnaud/bp-office)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/BP-Arnaud/bp-office)](https://github.com/BP-Arnaud/bp-office/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/BP-Arnaud/bp-office/total)](https://github.com/BP-Arnaud/bp-office/releases)

[Download](https://github.com/BP-Arnaud/bp-office/releases/latest) ·
[Privacy](PRIVACY.md) · [Security](SECURITY.md)

## Highlights

- Byte-preserving Word editing with faithful pagination, styles, comments,
  tracked changes, equations, and ink.
- Excel-compatible spreadsheets with CSV and macro-enabled workbook support,
  charts, pivot tables, slicers, conditional formatting, and formula tracing.
- Real PDF text and image editing, annotations, forms, signatures, page tools,
  printing, and local OCR.
- Fully local PDF-to-Word and PDF-to-Excel conversion. PDF-to-PowerPoint is not
  included.
- Plain Markdown editing with local Markdown-to-Word export.
- Explorer drag-and-drop opens compatible files in new tabs and reuses an
  existing tab when the file is already open.
- Light, dark, and system themes.
- No Slides editor, Genspark account/cloud integration, network AI Search, or
  usage telemetry.

## AI providers

BP-Office exposes two AI connections under **Settings → AI Provider**.

### LM Studio

LM Studio is the default. BP-Office connects to the OpenAI-compatible endpoint
at `http://127.0.0.1:1234/v1`, discovers local LLMs, and prefers a loaded model
with tool support. The server URL, optional token, and automatic or manual
model choice are configurable. When the token is blank, BP-Office sends no
`Authorization` header.

The status row in the bottom-left corner reports whether LM Studio is
connected, has no models, requires authentication, or is unreachable.

### ChatGPT subscription

The optional ChatGPT connection uses the official `@openai/codex` app-server
runtime and browser OAuth. It keeps credentials in an isolated BP-Office
`CODEX_HOME`; it does not copy credentials from Codex Desktop or Codex CLI.
Only validated editor tools are bridged into the session. Shell, filesystem,
browser, web-search, apps, plugins, connectors, image generation, computer
control, and subagent capabilities remain disabled.

ChatGPT requests and usage remain subject to the limits of the connected
subscription. BP-Office permits up to 200 tool turns per run, restores up to
512 messages, and maintains a 1 MiB conversation budget (approximately 256K
tokens) with compaction retaining the newest 384 KiB. The selected model's own
context limit still applies.

BP-Office has no network search tool. Ordinary Ctrl+F, PDF/document search,
Sheets find/replace, workbook inspection, and the local agent `search_text`
tool remain available.

## Download

Windows contributor builds are published on
[BP-Office Releases](https://github.com/BP-Arnaud/bp-office/releases). Each
release includes checksums.

| Build                   | Artifact                           |
| ----------------------- | ---------------------------------- |
| Windows installer (x64) | `BP-Office Setup <version>.exe`    |
| Windows portable (x64)  | `BP-Office Portable <version>.exe` |
| SHA-256 checksums       | `SHA256SUMS.txt`                   |

Unless a release explicitly says otherwise, contributor Windows executables
are unsigned.

## Shipped editors

| Source          | Product            | Formats                          |
| --------------- | ------------------ | -------------------------------- |
| `apps/docs`     | BP-Office Docs     | `.docx`                          |
| `apps/sheets`   | BP-Office Sheets   | `.xlsx`, `.xlsm`, `.xls`, `.csv` |
| `apps/pdf`      | BP-Office PDF      | `.pdf`                           |
| `apps/markdown` | BP-Office Markdown | `.md`, `.markdown`               |
| `apps/shell`    | BP-Office          | Tabbed desktop shell             |

Standalone upstream Slides source and presentation-engine packages may remain
in the repository for shared rendering or historical development, but the
Slides application, `.pptx` opening paths, and Slides resources are not built
or packaged.

## Development

BP-Office is based on GenOffice v0.8.358 and preserves the internal
`@genoffice/*` workspace names, `com.genoffice.app` bundle identifier, and
`GenOffice` user-data directory for compatibility.

```bash
npm ci
npm test
npm run typecheck
npm run build:all
npm run dist:win
```

The Sheets application also needs a Rust toolchain (`cargo` on `PATH`) to
build its native xlsx sidecar.

Core packages include `docx-engine`, `pdf2docx`, `file-parse`, `agent-core`,
`ai-provider`, `project-store`, `electron-utils`, `i18n`, and `ui`. The
presentation engines remain because non-Slides rendering paths still depend on
them. The removed `ai-search` workspace is intentionally absent.

## Migration from older builds

Stored `genspark` or unknown active providers migrate to LM Studio. Valid LM
Studio, ChatGPT, retained adapter, and custom-endpoint configurations remain
intact. BP-Office stops reading legacy Genspark authentication and cloud-project
files but does not delete them. If they are no longer needed, they may be
removed manually from the legacy `GenOffice` application-data directory after
making any desired backup.

## Privacy and security

Document editing is local. LM Studio requests go to the configured LM Studio
server. ChatGPT requests go to OpenAI only while that provider is used.
BP-Office does not include the upstream analytics pipeline. See
[PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Attribution and license

BP-Office is a fork of [GenOffice](https://github.com/genspark-ai/genoffice)
and retains its copyright notices and legal history. GenOffice and Genspark
names and logos are trademarks of Mainfunc, Inc.; BP-Office uses independent
branding. The Apache-2.0 license does not grant trademark rights.

The Apache-2.0 source is covered by [LICENSE](LICENSE). The existing `ee/`
directory remains governed by its historical
[GenOffice Enterprise License](ee/LICENSE). Third-party terms are generated by
`npm run notices` and bundled with releases.
