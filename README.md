# NiuOffice

![NiuOffice gradient-outline logo](branding/niuoffice-gradient-outline.svg)

NiuOffice is a free, open-source desktop office suite with local-first editing
and optional AI assistance. It works with Word (`.docx`), Excel (`.xlsx`,
`.xlsm`, `.xls`, `.csv`), PDF, and Markdown files and keeps those editors
together in one tabbed application.

> **OEM branch:** this branch is the source-only distributor template. It
> exposes OpenAI Endpoint only, does not package the ChatGPT subscription
> runtime, and does not publish NiuOffice-branded executables. See
> [OEM_CUSTOMIZATION.md](OEM_CUSTOMIZATION.md) before creating a branded build.
> The personal NiuOffice edition is maintained on [`main`](../../tree/main).

[![License: Apache-2.0](https://img.shields.io/github/license/Niuulh/NiuOffice)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/Niuulh/NiuOffice)](https://github.com/Niuulh/NiuOffice/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Niuulh/NiuOffice/total)](https://github.com/Niuulh/NiuOffice/releases)

[Download](https://github.com/Niuulh/NiuOffice/releases/latest) ·
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

## Editions and maintained branches

NiuOffice has two maintained release tracks:

- [`main`](https://github.com/Niuulh/NiuOffice/tree/main) is the personal
  edition. It includes OpenAI Endpoint and the optional ChatGPT subscription
  connection. Tagged `main` releases publish the Windows installer and
  portable executable.
- [`OEM`](https://github.com/Niuulh/NiuOffice/tree/OEM) is the distributable
  source edition. It exposes only OpenAI Endpoint and contains an OEM
  rebranding/update configuration guide. NiuOffice does not publish binaries
  from this branch.

Shared development starts on `main` and is then integrated into `OEM` with the
OEM provider and packaging gates kept intact. Historical branches such as
`GPT` and `feat/lmstudio-provider` are retained but are not active release
tracks. See [BRANCHES.md](BRANCHES.md) for the maintenance and release rules.

## AI provider

The OEM edition exposes one AI connection under **Settings → AI Provider**.

### OpenAI Endpoint

OpenAI Endpoint is the default. NiuOffice connects to the configured
OpenAI-compatible endpoint, discovers available LLMs, and prefers a loaded
model with tool support. The default URL, `http://127.0.0.1:1234/v1`, matches
LM Studio's local server. The server URL, API key, and automatic or manual
model choice are configurable. The API key is required and every discovery,
status, chat, vision, and tool-call request sends it as
`Authorization: Bearer <api-key>`. This also supports authenticated hosted
endpoints such as Unsloth and lets the server identify each assigned client
key.

The status row in the bottom-left corner reports whether OpenAI Endpoint is
connected, has no models, requires authentication, or is unreachable. ChatGPT
subscription selection, OAuth IPC, and the Codex runtime are disabled and not
packaged in this edition. NiuOffice permits up to 200 tool turns per run,
restores up to 512 messages, and maintains a 1 MiB conversation budget
(approximately 256K tokens) with compaction retaining the newest 384 KiB. The
selected endpoint model's own context limit still applies.

NiuOffice has no network search tool. Ordinary Ctrl+F, PDF/document search,
Sheets find/replace, workbook inspection, and the local agent `search_text`
tool remain available.

## Distribution

The NiuOffice repository publishes no executable from `OEM`. A distributor
must first apply a unique identity and branding, configure its own public
GitHub Releases feed, and build in its own repository by following
[OEM_CUSTOMIZATION.md](OEM_CUSTOMIZATION.md).

The personal `main` edition publishes these NiuOffice artifacts when its public
update feed is configured:

| Build                   | Artifact                           |
| ----------------------- | ---------------------------------- |
| Windows installer (x64) | `NiuOffice-Setup-<version>.exe`    |
| Windows portable (x64)  | `NiuOffice-Portable-<version>.exe` |
| Complete source archive | `NiuOffice-<version>-source.zip`   |
| Update metadata         | `latest.yml`                       |
| SHA-256 checksums       | `SHA256SUMS.txt`                   |

Unless a release explicitly says otherwise, contributor Windows executables
are unsigned.

Installed personal-edition builds check the configured public GitHub Releases feed and
offer newer installer releases in the app. Releases are repository-wide, so
the release workflow accepts only a tag whose commit is the current `main`
commit. The feed and its assets must be readable without authentication; an
access token is never embedded in NiuOffice. A private source repository must
therefore publish updater assets in a separate public update repository.

Portable builds are deliberately manual-update-only. The existing
`0.8.667-niu.3` installer also predates the updater feed metadata, so it cannot
discover a later version: install the first updater-enabled setup executable
manually once to enter the automatic-update track.

## Shipped editors

| Source          | Product            | Formats                          |
| --------------- | ------------------ | -------------------------------- |
| `apps/docs`     | NiuOffice Docs     | `.docx`                          |
| `apps/sheets`   | NiuOffice Sheets   | `.xlsx`, `.xlsm`, `.xls`, `.csv` |
| `apps/pdf`      | NiuOffice PDF      | `.pdf`                           |
| `apps/markdown` | NiuOffice Markdown | `.md`, `.markdown`               |
| `apps/shell`    | NiuOffice          | Tabbed desktop shell             |

Standalone upstream Slides source and presentation-engine packages may remain
in the repository for shared rendering or historical development, but the
Slides application, `.pptx` opening paths, and Slides resources are not built
or packaged.

## Development

NiuOffice is based on GenOffice v0.8.667 and preserves the internal
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

Stored `genspark`, ChatGPT, retained-adapter, or unknown active providers
migrate to OpenAI Endpoint in the OEM edition (the internal provider ID remains
`lmstudio` for settings compatibility). Their saved configuration records are
not deleted, but they cannot become active. NiuOffice stops reading legacy
Genspark authentication and cloud-project files and does not delete them. If
they are no longer needed, they may be removed manually from the legacy
`GenOffice` application-data directory after making any desired backup.

## Privacy and security

Document editing is local. OpenAI Endpoint requests go only to the configured
server and always carry the configured Bearer API key. The OEM edition has no
ChatGPT subscription connection. NiuOffice does not include the upstream analytics pipeline. See
[PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Attribution and license

NiuOffice is a fork of [GenOffice](https://github.com/genspark-ai/genoffice)
and retains its copyright notices and legal history. GenOffice and Genspark
names and logos are trademarks of Mainfunc, Inc.; NiuOffice uses independent
branding. The Apache-2.0 license does not grant trademark rights.

The Apache-2.0 source is covered by [LICENSE](LICENSE). The existing `ee/`
directory remains governed by its historical
[GenOffice Enterprise License](ee/LICENSE). Third-party terms are generated by
`npm run notices` and bundled with releases.
