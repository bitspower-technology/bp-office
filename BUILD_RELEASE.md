# BP Office build and delivery (Windows)

Product: **BP Office**, the endpoint-only OEM edition published by Bitspower Technology.
Application version: `1.1.0` (`apps/shell/package.json`), release tag `v1.1.0`.
Upstream base: NiuOffice OEM snapshot `0.10.1467-niu.1` (upstream GenOffice tag
`v0.10.1467`, commit `dfe2a6d954f7c6486ad08f09727cae91f175ff7a`), imported as the
`vendor/oem-0.10.1467` branch and merged into `bp/1.1`.

Delivery is **Windows x64 only**. No Linux AppImage or RPM is built, published, or
supported for BP Office, so no Linux build host belongs to this pipeline. The inherited
upstream files (`release-main.yml`, `build-packages.yml`, `tools/assemble-release.mjs`)
keep their main-edition guards and are never used by a BP Office release; refusing OEM
source is exactly what they are for, and BP's own workflow produces the tagged source
archive, checksums, and updater metadata instead.

## Release branch and tag (current state)

| Item                                         | Value                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Development trunk                            | `main`                                                                       |
| Authorized release branch (`RELEASE_BRANCH`) | `bp/1.1`, until 1.1.0 is accepted                                            |
| Application version                          | `1.1.0` in `apps/shell/package.json`                                         |
| Release tag                                  | `v1.1.0`, on the exact tip of the authorized release branch                  |
| Update feed                                  | `https://github.com/bitspower-technology/bp-office/releases/latest/download` |
| Signing                                      | unsigned (no Bitspower Technology certificate provisioned yet)               |

When 1.1.0 is accepted: merge `bp/1.1` into `main`, set `RELEASE_BRANCH: main` again in
`.github/workflows/release-bpoffice.yml` in that same change, and tag the new tip. Nothing
is pushed or published before that decision (see "Publishing").

## Build host requirements (Windows)

- Node.js 22.12+ with npm 10+. The test suite must run on **Node 22**: newer Node reports
  about 69 false failures (`Cannot read properties of undefined (reading 'removeItem')`)
  from the jsdom environment, not from product code.
- Stable Rust/Cargo for the native Windows target plus Visual Studio 2022 C++ build tools.
  `cl.exe` must be on PATH or the xlsx sidecar fails in `bzip2-sys`/`zstd-sys`; call
  `vcvars64.bat` before building.
- Windows PowerShell on PATH: electron-builder spawns `powershell.exe` and dies with
  `spawn powershell.exe ENOENT` when it is missing.
- `PATHEXT` including `.CMD;.BAT`. A restricted `PATHEXT` of `.EXE;.COM` hides `tsc`,
  `eslint`, and `electron-builder` from `node_modules\.bin`.
- Chrome or Chromium for the `html2docx` tests: set `CHROME_PATH` (the Playwright Chromium
  build works).
- A clean checkout installed with `npm ci`. Never mix npm and pnpm dependency trees.

## Validate

```sh
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
```

`check:product-boundaries` and `check:oem-boundaries` are release gates, not style checks.
They fail when ChatGPT/Codex surfaces, the Slides workspace, cloud or AI Search wiring, or
an upstream update feed reappears in an OEM build.

## Package (Windows)

```sh
npm run dist:win
node tools/audit-release.mjs apps/shell/release
```

`dist:win` regenerates third-party notices, builds every workspace and the shell, and writes
into `apps/shell/release`:

- `BPOffice-Setup-1.1.0.exe` - NSIS installer; the only asset `latest.yml` may reference
- `BPOffice-Setup-1.1.0.exe.blockmap` - differential-download map used by the updater
- `BPOffice-Portable-1.1.0.exe` - portable build, manual updates only
- `latest.yml` - updater feed: version, setup file name, and the setup SHA-512
- `win-unpacked/` - unpacked application that `tools/audit-release.mjs` inspects

The audit requires the Docs, Sheets, PDF, Markdown, and HTML modules, the xlsx sidecar,
`pdfium.wasm`, `hb-subset.wasm`, the Windows OCR helper, and the license/notice files, and it
refuses `codex.exe`, `codex-code-mode-host.exe`, a slides module, and any
Genspark/AI Search/Analytics reference.

Hand-off checksums:

```text
Get-ChildItem apps/shell/release -Filter 'BPOffice-*' |
  Get-FileHash -Algorithm SHA256 |
  Format-Table Hash, Path -AutoSize
```

## Signing status

BP Office releases are **unsigned**: no Bitspower Technology Authenticode certificate is
provisioned yet. `CSC_IDENTITY_AUTO_DISCOVERY` stays `false` so a build host can never pick
an identity it happens to own, and the release workflow fails when `WINDOWS_CSC_LINK` is
supplied but the executables come out unsigned. Release notes always state the signing state
explicitly; never describe an unsigned BP Office binary as production-signed.

What that means for testers: SmartScreen shows "The publisher could not be verified" on
first launch - choose **More info** then **Run**. Browsers likewise warn when downloading an
unsigned installer (for example **More options** then **Keep**).

## Installing a local build (no release needed)

1. Install `BPOffice-Setup-1.1.0.exe` as a normal user: it is a per-user install and needs
   no administrator rights.
2. Settings live in `%APPDATA%\BPOffice`. That directory survives an upgrade and is what the
   A-to-B update test inspects for surviving endpoint configuration.
3. Before publishing, check the icon layers (window title bar, document tab, Home, menu, and
   Explorer file association) in light and dark themes at 2048x1100 and 980x700, opening a
   file from Explorer, an AI panel Endpoint round-trip, and Docs/Sheets/PDF/Markdown editing.

## Publishing (only after the release is approved)

Nothing is published automatically; `bp/1.1` and `v1.1.0` stay local until the installer has
been tested on a real desktop.

```sh
git tag -d v1.1.0            # only if the branch moved after testing
git tag v1.1.0               # tag the exact tip that was validated
git push origin bp/1.1 v1.1.0
```

`.github/workflows/release-bpoffice.yml` then re-checks, before publishing anything: the tag
form and that it equals `v<apps/shell/package.json version>`; `edition: oem`,
`features.chatgptSubscription: false`, and `updates.enabled: true`; a URL-safe
`artifactSlug`; that the configured feed repository is exactly
`bitspower-technology/bp-office` and equals the workflow repository; that the tag is the
current release-branch tip, re-checked again after the build; that the repository is public;
strict forward version ordering against the live feed; `latest.yml` name and SHA-512
agreement with the built installer; that the portable executable never appears in the feed;
and consistent Authenticode state. It uploads Setup, Portable, `latest.yml`,
`SHA256SUMS.txt`, and `BPOffice-<version>-source.zip` (a `git archive` of the tagged commit),
creates the release as a draft, and marks it Latest.

Never overwrite an already published release: its assets are immutable, so publish a newer
version instead. An updater feed must stay anonymously readable - never embed a token in the
application or in `branding/product.json`.

## Auto-update smoke test

1. Install version A and confirm the About box reports A.
2. Publish strictly newer version B from the next authorized release-branch tip tag.
3. Confirm the updater offers B, upgrades in place, keeps `%APPDATA%\BPOffice` settings
   (endpoint URL and model, theme, recent files), and that portable builds never update
   themselves.

## Removed features and context policy

No external MCP endpoint, headless server or export mode, automation CLI, cloud login or
media search, Slides app, network AI Search, or analytics is shipped. Local Find, workbook
inspection, ordinary editor actions, and PDF conversion remain available. ChatGPT
subscription support stays absent at source, build, packaging, and runtime level.

The context allowance is 130,000 estimated tokens (520,000 UTF-8 bytes); actual
provider/model limits can be smaller. Output-token settings are separate. The agent retains
the 200-tool-turn and 512-restored-message limits.
