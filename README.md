# BP Office

<img src="branding/source/icon.png" alt="BP Office" width="96" height="96" />

BP Office is a free, open-source desktop office suite from Bitspower Technology
with local-first editing and optional AI assistance. It works with Word
(`.docx`), Excel (`.xlsx`, `.xlsm`, `.xls`, `.csv`), PDF, and Markdown files and
keeps those editors together in one tabbed application.

> **Distributor build:** BP Office is the endpoint-only OEM edition. It exposes
> OpenAI Endpoint only, never packages the ChatGPT subscription runtime, ships no
> Slides editor, cloud integration, network AI Search, or telemetry, and updates
> from this repository's public GitHub Releases feed. See
> [OEM_CUSTOMIZATION.md](OEM_CUSTOMIZATION.md) for the rebranding and update rules
> this repository follows.

[![License: Apache-2.0](https://img.shields.io/github/license/bitspower-technology/bp-office)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/bitspower-technology/bp-office)](https://github.com/bitspower-technology/bp-office/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/bitspower-technology/bp-office/total)](https://github.com/bitspower-technology/bp-office/releases)

[Download](https://github.com/bitspower-technology/bp-office/releases/latest) ·
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

## Branches and releases

BP Office keeps one trunk:

- `main` is both the development branch and the authorized release branch. A
  Windows binary may only be produced from a tag whose commit is the exact tip
  of `main`, by [`.github/workflows/release-bpoffice.yml`](.github/workflows/release-bpoffice.yml).
- Release tags use `v<apps/shell/package.json version>` — for example
  `v1.0.0-bp.1` — and every published release is public, non-prerelease, and
  marked Latest so the updater feed resolves anonymously.

Upstream work flows in one direction: shared changes land in the upstream BP Office
`main`, are integrated into its `OEM` template branch, and are then merged into this
repository. The OEM provider, boundary, and packaging gates must stay green after
every merge.

## AI provider

BP Office exposes one AI connection under **Settings → AI Provider**.

### OpenAI Endpoint

OpenAI Endpoint is the only selectable provider (the internal provider ID stays
`lmstudio` for settings compatibility). BP Office connects to the configured
OpenAI-compatible endpoint, discovers available LLMs, and prefers a loaded model
with tool support. The default URL, `http://127.0.0.1:1234/v1`, matches LM
Studio's local server; point it at your own OpenAI-compatible service in
`packages/ai-provider/src/lmstudio.ts` (`LM_STUDIO_DEFAULT_BASE_URL`) or let each
user set it in Settings. Hosted endpoints must use HTTPS.

An API key is mandatory: blank keys are rejected before any network access, and
every discovery, status, chat, streaming, vision, and tool-call request sends
`Authorization: Bearer <api-key>`. Each customer receives a distinct
server-issued key — there is no vendor-wide fallback key, and no key is ever
committed, packaged, or logged. The key is stored in `<userData>/ai-settings.json`
in plain text; treat that file as sensitive.

The status row in the bottom-left corner reports whether OpenAI Endpoint is
connected, has no models, requires authentication, or is unreachable. ChatGPT
subscription selection, OAuth IPC, and the Codex runtime are disabled and not
packaged. BP Office permits up to 200 tool turns per run, restores up to 512
messages, and maintains a 1 MiB conversation budget (approximately 256K tokens)
with compaction retaining the newest 384 KiB. The selected endpoint model's own
context limit still applies.

BP Office has no network search tool. Ordinary Ctrl+F, PDF/document search,
Sheets find/replace, workbook inspection, and the local agent `search_text` tool
remain available.

## Distribution and automatic updates

Installed BP Office builds update from this repository's public generic feed:

```text
https://github.com/bitspower-technology/bp-office/releases/latest/download
```

`apps/shell/electron-builder.cjs` derives that URL from
[`branding/product.json`](branding/product.json) (`repository.owner`,
`repository.name`) and bakes it into `app-update.yml`; the same values drive the
in-app repository and manual-download links. `updates.enabled` is therefore only
true here because this repository publishes the matching public releases.

| Build                   | Artifact                          |
| ----------------------- | --------------------------------- |
| Windows installer (x64) | `BPOffice-Setup-<version>.exe`    |
| Windows portable (x64)  | `BPOffice-Portable-<version>.exe` |
| Complete source archive | `BPOffice-<version>-source.zip`   |
| Update metadata         | `latest.yml`                      |
| SHA-256 checksums       | `SHA256SUMS.txt`                  |

The feed must stay readable without authentication; an access token is never
embedded in BP Office. Releases are repository-wide, so the release workflow
accepts only a tag whose commit is the current `main` commit, and it never
overwrites the assets of an already published release. `latest.yml` references
only the setup executable — portable builds stay deliberately manual-update-only.

Releases are unsigned until Bitspower Technology configures its own Windows code
signing certificate as `WINDOWS_CSC_LINK` / `WINDOWS_CSC_KEY_PASSWORD` in this
repository's Actions secrets. Unsigned builds are labelled `unsigned contributor
build` in the release notes and trigger SmartScreen reputation warnings on first
launch.

## Shipped editors

| Source          | Product            | Formats                          |
| --------------- | ------------------ | -------------------------------- |
| `apps/docs`     | BP Office Docs     | `.docx`                          |
| `apps/sheets`   | BP Office Sheets   | `.xlsx`, `.xlsm`, `.xls`, `.csv` |
| `apps/pdf`      | BP Office PDF      | `.pdf`                           |
| `apps/markdown` | BP Office Markdown | `.md`, `.markdown`               |
| `apps/shell`    | BP Office          | Tabbed desktop shell             |

Upstream Slides source and presentation-engine packages may remain in the tree
for shared rendering or historical development, but the Slides application,
`.pptx` opening paths, and Slides resources are not built or packaged.

## Application identity

| Field               | Value                       |
| ------------------- | --------------------------- |
| Product name        | `BP Office`                 |
| AI name             | `BP Office AI`              |
| Vendor              | `Bitspower Technology`      |
| Windows app id      | `com.bitspower.bpoffice`    |
| Executable          | `bpoffice`                  |
| Linux desktop id    | `bpoffice.desktop`          |
| User-data directory | `BPOffice` (`BPOffice Dev`) |
| Update feed         | this repository's Releases  |

Those values are chosen once and must not change between releases: changing them
strands settings, creates a second installation, or breaks upgrade/uninstall
behavior. They intentionally share nothing with the upstream BP Office/GenOffice
identities, so both products can coexist on one machine.

## Branding assets

- `branding/source/` holds the distributor-supplied master art (1024px icon and
  the vector wordmark). It is the input, never edited by hand.
- `tools/trace-brand-mark.py` traces the monochrome mark once into
  `branding/bpoffice-mark.svg` plus the shared React icon constant in
  `packages/ui/src/brand-mark.ts`.
- `apps/shell/build/generate-brand-assets.py` derives every shell asset (ICO,
  ICNS, PNG sets, transparent mark, Home lockup) from those two committed inputs.

```bash
python apps/shell/build/generate-brand-assets.py
```

## Development

BP Office keeps the internal `@genoffice/*` workspace package names and imports:
they are dependency identities inside the repository, not shipped branding. The
shipped identity is BP Office (see the table above).

Requires Node.js >= 22.12 with npm (the committed `package-lock.json` is npm v3),
Python 3 with Pillow for brand asset generation, and a Rust toolchain (`cargo` on
`PATH`) for the Sheets native xlsx sidecar.

```bash
npm ci
npm run format:check
npm run check:theme-colors
npm run check:english-comments
npm run check:product-boundaries
npm run check:oem-boundaries
npm run lint
npm run typecheck
npm test
npm run notices
npm run build:all
npm run dist:win
```

Core packages include `docx-engine`, `pdf2docx`, `file-parse`, `agent-core`,
`ai-provider`, `project-store`, `electron-utils`, `i18n`, and `ui`. The removed
`ai-search` workspace is intentionally absent.

## Migration from older builds

Stored `genspark`, ChatGPT, retained-adapter, or unknown active providers migrate
to OpenAI Endpoint (the internal provider ID remains `lmstudio` for settings
compatibility). Their saved configuration records are not deleted, but they cannot
become active. Legacy Genspark authentication and cloud-project files are no longer
read; because BP Office uses its own `BPOffice` user-data directory, an existing
upstream installation is left untouched.

## Privacy and security

Document editing is local. OpenAI Endpoint requests go only to the configured
server and always carry the configured Bearer API key. BP Office has no ChatGPT
subscription connection and does not include the upstream analytics pipeline. See
[PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Attribution and license

BP Office is a downstream distribution of the BP Office edition, which is
itself a fork of GenOffice. All upstream copyright notices and legal history are
preserved in [LICENSE](LICENSE), [NOTICE](NOTICE), and
[LICENSE-UNICODE.txt](LICENSE-UNICODE.txt). GenOffice, Genspark, and BP Office names
and logos are trademarks of their respective owners; BP Office uses independent
branding. The Apache-2.0 license does not grant trademark rights.

The `ee/` directory remains governed by its historical
[GenOffice Enterprise License](ee/LICENSE). Third-party terms are generated by
`npm run notices` and bundled with releases.
