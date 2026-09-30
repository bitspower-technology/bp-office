# OEM rebranding and update setup runbook

Baseline: NiuOffice **0.10.1467-niu.1, OEM edition**, adapted from GenOffice
v0.10.1467. Confirm the checked-out version and commit before editing. Main
and OEM share this maintenance version; the edition/provider policy differs.
A distributor chooses its own version/tag namespace before its first release.

This document is an execution contract for an AI coding agent adapting the
`OEM` branch for one distributor. Read the current repository before editing,
make evidence-based changes, and stop if a required input is missing. Never
guess an application identity, repository, signing identity, endpoint, or
customer credential.

The BP Office `OEM` branch itself is source-only. Do not tag it, publish an OEM
release from it, or upload OEM executables to `bitspower-technology/bp-office`. A distributor
must perform the work in its own fork/repository and own its application
identity, public update feed, credentials, signing certificate, and releases.

## Non-negotiable product invariants

The finished OEM product must satisfy all of these conditions:

- `branding/product.json` keeps `"edition": "oem"` and
  `features.chatgptSubscription: false`.
- OpenAI Endpoint, whose compatibility ID is `lmstudio`, is the only provider
  that can be selected through UI, persisted settings, IPC, or an editor
  request. Do not rename the internal `lmstudio` ID as part of branding.
- `@openai/codex` is absent from `apps/shell/package.json` and
  `package-lock.json`, and no `native/codex*` runtime is packaged.
- Every client has its own non-empty endpoint API key. Every
  application-originated model-list, chat, streaming, vision, and tool-call
  request carries exactly `Authorization: Bearer <client-api-key>`.
- No API key, signing credential, repository token, or authenticated URL is
  committed, built into an executable, printed in CI output, or copied into a
  release note.
- Slides, Genspark cloud integration, network AI Search, telemetry, MCP,
  headless/control servers, CLI bridges, and their setup UI/resources stay
  absent from the shipped product. Local Find, workbook inspection, Home
  local-file indexing, and ordinary editor tools remain available.
- Ship exactly Docs, Sheets, PDF, Markdown, and the new HTML editor, with
  required local export/preview functionality. HTML previewing is not a reason
  to restore a headless server or external control listener.
- The unsolicited “Enjoying NiuOffice / Star NiuOffice” invitation is removed.
  Do not restore its UI, eligibility tracking, startup/upgrade scheduling, or
  IPC. Ordinary user-requested Help/repository links remain available. Old
  prompt settings are ignored, not destructively deleted from user profiles.
- Preserve the estimated 130K-token context budget, 200 model/tool turns per
  run, 512-message restoration, and old-history compaction. See the context
  section below; these are not guarantees about a server model's tokenizer.
- The independent application identity and user-data directory are chosen
  before the first release and are not changed afterward.
- Installed builds update only from an anonymously readable public release
  feed controlled by the distributor. Windows Setup and Linux AppImage may
  auto-update; Windows Portable and Fedora RPM remain manual-update only.
- Apache-2.0 attribution, `LICENSE`, `NOTICE`, third-party notices, font
  licenses, and historical legal attribution are preserved.

If a requested customization conflicts with one of these invariants, report
the conflict instead of weakening the invariant.

## Required inputs

Obtain and record the following values before changing source. Placeholders
are not acceptable in a release commit.

| Input                           | Requirement                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Product name                    | Exact user-facing desktop application name.                                                         |
| AI name                         | Exact user-facing assistant name, normally `<Product> AI`.                                          |
| Vendor/publisher                | Legal distributor or contributor name shown in package metadata.                                    |
| Application ID                  | A vendor-owned, unique, reverse-DNS ID such as `com.example.product`.                               |
| Artifact slug                   | URL-safe filename prefix matching `[A-Za-z0-9][A-Za-z0-9._-]*`; no spaces.                          |
| Executable name                 | Stable, filesystem-safe executable basename, preferably lowercase.                                  |
| Desktop name                    | Stable Linux desktop ID, normally `<executable>.desktop`.                                           |
| User-data directory             | Unique production directory under the OS application-data root.                                     |
| Development user-data directory | Separate unique directory for development builds.                                                   |
| Source repository               | Distributor-owned public source/release repository URL.                                             |
| Public update repository        | Same GitHub owner/name as the source/workflow repository; releases and assets anonymously readable. |
| Release branch                  | Branch whose exact tip is allowed to produce client binaries.                                       |
| Version and tag policy          | Valid SemVer plus an exact matching tag, for example `1.0.0-oem.1` and `v1.0.0-oem.1`.              |
| Default endpoint URL            | OpenAI-compatible HTTP(S) base, normally ending in `/v1`; hosted services must use HTTPS.           |
| API-key provisioning policy     | How each client receives and enters its unique key; do not request the key value for source work.   |
| Logo source                     | Trusted SVG/vector source, wordmark, palette, background treatment, and safe-zone rules.            |
| Support/security URLs           | Public support, security-reporting, privacy, and community links.                                   |
| Signing policy                  | Windows certificate owner and CI secret names, or an explicit unsigned-build decision.              |

The current settings implementation writes the endpoint key to
`<userData>/ai-settings.json`. Do not describe this as encrypted storage. If
the distributor requires OS-keychain or centrally managed secret storage,
implement and test that separately before release. Do not solve provisioning
by placing a shared key in source or installer resources.

## Work safely in a downstream repository

1. Start from the latest validated `OEM` commit in a new distributor-owned
   branch.
2. Confirm the worktree is clean and record the starting commit.
3. Make the product-config, endpoint, branding, documentation, test, and
   workflow changes described below.
4. Validate locally and in CI. A local package may be created for validation,
   but do not upload it to the BP Office repository.
5. Commit and push source to the distributor's repository.
6. Only after the public feed and signing policy are ready, create the first
   distributor release from the distributor's authorized release branch.

For later upstream work, integrate shared changes from BP Office `main` into
BP Office `OEM` first, then merge the resulting OEM branch into the downstream
fork. Re-run every endpoint-only and packaging gate after resolving conflicts.

## Configure the product identity

`branding/product.json` is the central shell identity and feature file. A
release-ready downstream configuration has this shape:

```json
{
  "schemaVersion": 1,
  "edition": "oem",
  "productName": "CLIENT_PRODUCT_NAME",
  "aiName": "CLIENT_AI_NAME",
  "vendor": "CLIENT_VENDOR",
  "appId": "com.client.product",
  "artifactSlug": "ClientProduct",
  "executableName": "clientproduct",
  "desktopName": "clientproduct.desktop",
  "userDataDirectory": "ClientProduct",
  "developmentUserDataDirectory": "ClientProduct Dev",
  "repository": {
    "owner": "CLIENT_GITHUB_OWNER",
    "name": "CLIENT_PUBLIC_UPDATE_REPOSITORY"
  },
  "features": {
    "chatgptSubscription": false
  },
  "updates": {
    "enabled": true
  }
}
```

Keep `updates.enabled` false while the public feed is not ready. Set it true
only in a release build that points at the final public update repository.
`apps/shell/electron-builder.cjs` then derives the generic feed URL as:

```text
https://github.com/<owner>/<name>/releases/latest/download
```

The same repository fields drive the in-app repository and manual-download
URLs through `apps/shell/src/shared/product-config.ts`. The configuration is
validated in both the renderer/main TypeScript path and the packaging path.
Do not bypass its validation.

Choose `appId`, `executableName`, `desktopName`, and both user-data directory
names once. Reusing `com.genoffice.app`, `genoffice`, or the `GenOffice`
user-data directory can collide with BP Office/GenOffice installations.
Changing these values after release can strand settings, create a second
installation, or break upgrade/uninstall behavior.

The central JSON is not a universal string-replacement engine. Synchronize
the user-facing package metadata separately:

- `apps/shell/package.json`: `productName`, `version`, `homepage`,
  `description`, and `author`.
- Root `package.json`: repository URL and user-facing description. Keep the
  root version and internal workspace naming unless a concrete build reason
  requires changing them.
- User-facing metadata in `apps/docs/package.json`, `apps/sheets/package.json`,
  `apps/pdf/package.json`, `apps/markdown/package.json`, and
  `apps/html/package.json` when applicable.
- Synchronize `apps/shell/package.json.desktopName` with
  `branding/product.json.desktopName`; central JSON does not rewrite the
  source manifest automatically.
- For an independent distributor's first release, explicitly change the
  historical `deb.packageName` and `rpm.packageName` literals (`genoffice`) in
  `apps/shell/electron-builder.cjs` to the approved stable lowercase Linux
  package name. The defaults intentionally preserve NiuOffice's upgrade
  identity and must not be changed on the upstream main/OEM maintenance
  branches. Keep the client package name, executable basename, desktop ID,
  install directory, and GNOME/KDE identity consistent. Verify built metadata,
  not only filenames. This exception does not rename `@genoffice/*` packages.
- `packages/electron-utils/src/github-menu.ts`, whose star/repository URL is
  currently a literal.
- The shared About menu uses `branding/product.json.productName`; inspect its
  localized labels, dialog and copy-to-clipboard text during visual QA.
- `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, privacy
  text, support links, badges, and download examples.
- Tests that deliberately assert product identity, artifact names, or URLs.

Update `apps/shell/package.json` to the distributor version and regenerate the
npm lockfile with npm so its workspace entry stays synchronized. Do not hand
edit a large lockfile or use another package manager.

## Preserve the endpoint-only and API-key contract

The following files are the active enforcement layers. Preserve them when
merging or rebranding:

- `packages/ai-provider/src/product-edition.ts` constrains an OEM active
  provider to `lmstudio` and rejects unsupported provider IDs.
- `packages/ai-provider/src/providers.ts` declares OpenAI Endpoint with
  `requiresApiKey: true`.
- `apps/shell/src/main/lmstudio-settings.ts` rejects a blank key at the
  renderer/main IPC boundary and migrates unsupported saved providers.
- `packages/ai-provider/src/lmstudio.ts` makes model discovery call
  `lmStudioAuthHeaders`, which rejects a blank key and creates the Bearer
  header.
- `packages/ai-provider/src/chat.ts` and `stream.ts` reject a missing key
  before one-shot or streaming execution.
- `packages/ai-provider/src/protocols/openai-compatible.ts` places a configured
  key in the actual `/chat/completions` request headers.
- Every editor request path, including HTML, must apply the OEM edition
  policy in the main-process/shared provider layer. Renderer-supplied settings
  are untrusted. Preserve direct Docs/Sheets IPC guards and shared execution
  guards used by PDF, Markdown, and HTML.
- `apps/shell/src/main/index.ts`, `AiProviderPane.tsx`, and
  `packages/ai-provider/src/product-edition.ts` keep ChatGPT UI/IPC/runtime
  unavailable when the feature flag is false.
- `apps/shell/electron-builder.cjs` omits the Codex runtime when ChatGPT is
  disabled.

To change the downstream default endpoint, edit
`LM_STUDIO_DEFAULT_BASE_URL` in `packages/ai-provider/src/lmstudio.ts` and
update its tests. Keep `/v1` semantics. Never put a username, password, API
key, query string, or fragment in the URL. Plain HTTP is acceptable only for
a loopback/local endpoint; use HTTPS for a hosted endpoint.

Do not weaken the generic conditional header code merely to make a test pass.
The OEM invariant is established by requiring the key before any endpoint
adapter executes. Tests must prove that the native model request
`/api/v1/models`, fallback model request `/v1/models`, and every
`/v1/chat/completions` request carry the exact Bearer header, including retries,
streaming, vision input, and tool-call rounds. Blank or whitespace-only keys
must fail before network access. Authentication errors and logs must redact
the key.

Each installed client must enter or receive a different server-issued key.
The application must not include a vendor-wide fallback key. Rotate or revoke
keys at the endpoint service, not by publishing a new executable containing a
replacement secret.

## Context and tool limits

`packages/agent-core/src/loop.ts` exports
`EDITOR_AGENT_MAX_CONTEXT_TOKENS = 130_000`, the corresponding 520,000-byte
budget, and `EDITOR_AGENT_MAX_TURNS = 200`. The estimator approximates four
UTF-8 bytes per token, not the endpoint model's actual tokenizer. System
instructions, history, tool definitions/results, and input must fit the
outbound guard. A server may enforce a smaller real window or reserve output
space; retain actionable errors instead of promising universal 130K support.

Compaction retains up to the newest 384 KiB at a conversation boundary when
history reaches its budget. Restoration is capped at 512 messages. Preserve
the shared provider request guard and agent guard so direct chat, streaming,
vision, and editor-tool rounds cannot bypass the cap. Keep 200-turn
enforcement; do not describe it as unlimited calls or a billing allowance.
Run budget/compaction/oversized-input/tool-result/restoration/turn-limit tests
after changing providers or prompts.

## Replace the visual brand

The current visual system is partly generated and partly hardcoded. Replacing
one SVG file is insufficient.

### Canonical and hardcoded sources

- `branding/niuoffice-gradient-outline.svg` is the repository's canonical
  vector reference.
- `apps/shell/build/generate-brand-assets.py` does **not** parse that SVG. It
  hardcodes `MARK_WIDTH`, `MARK_HEIGHT`, `MARK_PATHS`, the three gradient
  colors, dark tile, raster sizing, lockup geometry, accessibility title, and
  `BP Office` wordmark. Update or rewrite this generator for the client art.
- `apps/shell/build/niuoffice-mark.svg` is a manually maintained accessible
  build copy. Keep it synchronized with the canonical vector and give it a
  correct `<title>`/ARIA relationship.
- `packages/ui/src/icons.tsx`, function `BP OfficeMark`, independently
  hardcodes the mark paths, gradients, view box, and ARIA label used by Docs,
  Sheets, PDF, Markdown, and HTML AI surfaces. It must render the client mark. The
  internal exported function name may remain `BPOfficeMark`; renaming it is
  optional churn, not a branding requirement.
- `apps/shell/src/renderer/src/assets/niuoffice-logo.svg` is the Home wordmark
  generated by the Python script. Its internal filename may remain unchanged,
  but its visible mark, text, title, and accessible label must be the client
  brand.

Use a trusted, self-contained SVG. Remove scripts, `foreignObject`, remote
references, imported styles, and embedded executable content. Preserve a
transparent safe zone and test legibility in both themes and at small Windows
taskbar sizes.

Run the generator after updating it:

```powershell
python apps/shell/build/generate-brand-assets.py
```

Review every generated output before committing:

- `apps/shell/build/icon.png`
- `apps/shell/build/icon-mac.png`
- `apps/shell/build/icon.ico`
- `apps/shell/build/icon.icns`
- `apps/shell/build/niuoffice-mark.png`
- `apps/shell/build/icons/16x16.png` through `1024x1024.png`
- `apps/shell/src/renderer/src/assets/app-icon.png`
- `apps/shell/src/renderer/src/assets/niuoffice-logo.svg`

These assets cover the executable, installer, taskbar/dock, Linux icon set,
Home, onboarding, and updater UI. Update
`apps/shell/tests/brand-assets.test.ts` to assert the new intended geometry,
colors, accessibility, output sizes, and product configuration. Do not remove
its SVG safety checks or ICO/ICNS structure checks.

### Document-kind icons in tabs, Home, menus, and the operating system

The small blue **W** shown beside a document title in the shell tab strip is
not the application logo and is not produced by
`generate-brand-assets.py`. It is the inline `DocIcon` React component in
`apps/shell/src/renderer/src/TabBar.tsx`. Rebranding only the application mark
will therefore leave this icon unchanged. Audit all five shipped document
kinds as a single icon family:

- `DocIcon` is used by `KIND_ICON.docs`.
- `SheetIcon` is used by `KIND_ICON.sheets`.
- `PdfIcon` is used by `KIND_ICON.pdf`.
- `MarkdownIcon` is used by `KIND_ICON.markdown`.
- `HtmlIcon` is used by `KIND_ICON.html` (the teal angle-bracket icon).

Each component currently contains its own hardcoded SVG `viewBox`, paths,
fills, background color, and explicit `width="16" height="16"`. Replace those
values with the approved client document-kind artwork; changing
the shared mark (`BP_OFFICE_MARK_PATH` in `packages/ui`), `app-icon.png`, or the
Home lockup does not affect them. Keep
the icons decorative with `aria-hidden="true"`, preserve all five `KIND_ICON`
mappings, and do not add `SlideIcon` or a `slides` mapping. `HomeIcon` is a
separate navigation glyph and is not one of the five document-kind marks.

The wrapper is `.tab-icon` in
`apps/shell/src/renderer/src/tabbar.css`. It currently supplies flex layout,
vertical centering, and `flex-shrink: 0`; the inline SVGs provide the actual
16-by-16-pixel size. Keep the wrapper, SVG size, tab gap, title truncation, and
close-button spacing visually aligned. If the approved artwork needs another
size, change the SVG dimensions and the relevant tab spacing together, then
test narrow tabs and high-DPI scaling rather than allowing CSS to stretch the
art implicitly.

The same document kinds have three additional, independent asset layers. A
complete rebrand must update all of them:

1. **Home quick-create and recent-file tiles.** Replace the self-contained
   SVG artwork in
   `apps/shell/src/renderer/src/assets/file-docx.svg`,
   `file-xlsx.svg`, `file-pdf.svg`, `file-md.svg`, and `file-html.svg`.
   `Home.tsx` maps these through `FILE_ICONS`; `markdown` reuses `file-md.svg`
   and `htm` reuses `file-html.svg`. Inspect XLS/CSV/TSV fallback tiles when
   defining the complete spreadsheet family. Preserve a square view box, transparent background where
   intended, and SVG safety rules (no scripts, `foreignObject`, remote
   references, or imported executable content).
2. **Native tab/overflow menus.** Replace the five 1x/2x pairs under
   `apps/shell/src/main/assets`: `menu-docx.png` plus
   `menu-docx@2x.png`, `menu-xlsx.png` plus `menu-xlsx@2x.png`,
   `menu-pdf.png` plus `menu-pdf@2x.png`, `menu-md.png` plus
   `menu-md@2x.png`, and `menu-html.png` plus `menu-html@2x.png`. They must be transparent RGBA PNGs at exactly 16x16 and
   32x32 pixels. `apps/shell/src/main/index.ts` loads both representations via
   `menuIcons()` and maps shell kinds through `TAB_MENU_ICON` (`docs` to
   `docx`, `sheets` to `xlsx`, `pdf` to `pdf`, `markdown` to `md`, and `html`
   to `html`). The
   separate `menu-home.png`/`menu-home@2x.png` pair belongs to Home navigation;
   replace it only if the client's approved system includes a branded Home
   glyph.
3. **Explorer/Finder file associations.** Regenerate
   `apps/shell/build/{docx,xlsx,pdf,md,html}.ico` and matching `.icns` files
   from the five Home SVGs. `apps/shell/electron-builder.cjs` maps DOCX to
   `docx`, XLSX/XLSM/XLS/CSV/TSV to `xlsx`, PDF to `pdf`, MD/Markdown to `md`,
   and HTML/HTM to `html`. Do not
   remove these `icon` fields: without them, Windows and macOS fall back to the
   generic application logo.

After changing any `file-*.svg`, run this from the repository root:

```powershell
node tools/gen-file-association-icons.mjs
```

The current generator launches the Playwright `chrome` channel and always
invokes Apple's `iconutil` before it writes the Windows ICO for each kind.
Consequently, run it on macOS with Chrome/Playwright available (or use a macOS
CI job), then commit both the `.icns` and `.ico` outputs. A Windows or Linux
run cannot produce the complete committed set as written; do not ship partial
output or leave stale ICNS files. If a downstream workflow must generate on
multiple platforms, deliberately split/refactor the generator and add tests
for both output paths first.

There must be no PPTX layer: no `file-pptx.svg`, `menu-pptx.png` or
`menu-pptx@2x.png`, `pptx.ico`, `pptx.icns`, `SlideIcon`, `KIND_ICON.slides`,
or PPTX file-association entry. Slides remains unshipped.

For visual QA, open DOCX, XLSX/CSV/TSV, PDF, Markdown, and HTML/HTM files together and
inspect their tab icons at normal and narrow tab widths in light and dark
themes. Check Home quick-create and recent-file cards, the native tab overflow
menu, and 100%, 125%, and 200% Windows display scaling. Install the validation
package and verify the associated file icons in Windows Explorer; verify the
same `.icns` artwork in Finder on macOS. Operating-system icon caches can retain
an old association, so validate after a clean install/reassociation or cache
refresh. Confirm PPTX is neither associated nor accepted for opening, and run
the focused shell brand-asset test before release.

The repository also contains standalone-editor icon remnants such as
`apps/docs/build/icon.*`, `apps/docs/src/renderer/assets/app-icon.png`, and
`apps/sheets/src/renderer/assets/app-icon.png`. The normal OEM shell package
does not ship standalone editor installers, but audit and replace these if a
downstream product deliberately builds a standalone editor. Do not add or
brand Slides assets: Slides remains unshipped.

### Visible text and accessibility

Search for both product names and repository links, then review each hit in
context:

```powershell
rg -n "BP Office AI|BP Office|bitspower-technology/bp-office" apps packages branding *.md package.json
```

At minimum, inspect these visible surfaces:

- Shell Home, onboarding, settings, update window, Help links, HTML titles,
  tab labels, and all shell locales under `apps/shell/src/renderer`.
- Docs AI/ribbon locale files and prompts under
  `apps/docs/src/renderer`.
- Sheets AI panel, ribbon, locale strings, and prompts under
  `apps/sheets/src/renderer`.
- PDF AI panel, ribbon locales, annotation defaults where user-visible, and
  `apps/pdf/src/renderer/ai/pdf-skill.ts`.
- Markdown ribbon, AI panel, HTML title, and
  `apps/markdown/src/renderer/ai/markdown-skill.ts`.
- HTML `App.tsx`, `components/Ribbon.tsx`, `ai/AiPanel.tsx`, every locale,
  document title, and `apps/html/src/renderer/ai/html-skill.ts`.
- New shell `home-interface-strings.ts`, existing `strings.ts`, and
  `ai-provider-strings.ts` under `apps/shell/src/renderer/src`.
- `packages/ui/src/icons.tsx` accessibility text.

Update every shipped locale, not just English. Update tests to the new intended
copy instead of deleting assertions. Internal filenames and component symbols
may retain BP Office names if they are not displayed and renaming them would
add migration risk.

## Safe and unsafe replacements

Safe, reviewed replacements include visible product/AI copy, accessibility
labels, package descriptions/authors, repository/support links, test
expectations, generated artwork, and the explicit fields in
`branding/product.json`.

Never perform a repository-wide blind replacement. In particular:

- Keep all `@genoffice/*` workspace package names and imports. They are
  internal dependency identities, not shipped branding.
- Keep the internal provider ID `lmstudio`; only its visible label is OpenAI
  Endpoint or the distributor's approved equivalent.
- Do not rewrite `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, the `ee/`
  license, upstream copyright history, or third-party license text.
- Preserve compatibility metadata such as `GenOfficeStaticFormFills` and
  `GenOfficeFormField` in PDF files unless a separately designed migration
  continues to read the legacy keys.
- Do not casually rename internal font families/files such as `BP Office Sans
KR`, `BP Office PUA Blank`, or their WOFF2 files. They are document-rendering
  compatibility aliases and may have reserved-name/license implications.
- Do not reintroduce Genspark, network AI Search, Slides, `.pptx` associations,
  cloud tools, analytics, MCP, headless/control servers, CLI bridges, or
  removed environment variables while resolving merges. A test's headless
  browser is not a shipped headless-server feature; retain safe test tooling.
- Never reuse NiuOffice's app ID, user-data directory, repository, update feed,
  logo, signing identity, or release tag namespace for an independent client.

When a visible string and an internal compatibility identifier use the same
word, change only the visible occurrence and add a focused test.

## Configure the public update feed

Electron-updater uses a generic provider baked by
`apps/shell/electron-builder.cjs`. With the stock release architecture, use
**one distributor-owned public repository for source, workflows, tags, and
release assets**. The workflow requires the configured repository to equal
`GITHUB_REPOSITORY`; a scoped `GITHUB_TOKEN` cannot upload elsewhere.

The final URL must be HTTPS without credentials, query, or fragment:

```text
https://github.com/<owner>/<name>/releases/latest/download
```

The public Latest release must include both feeds and matching artifacts:

| Asset                              | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `latest.yml`                       | Windows Setup update metadata only.                    |
| `<Slug>-Setup-<version>.exe`       | Windows installed update/installer.                    |
| `<Slug>-Portable-<version>.exe`    | Manual Windows download, never a feed target.          |
| `latest-linux.yml`                 | Linux AppImage metadata for the AppImage/RPM pipeline. |
| `<Slug>-<version>-x86_64.AppImage` | Linux direct download and AppImage updater target.     |
| `<Slug>-<version>.x86_64.rpm`      | Fedora package, never an AppImage feed target.         |
| `<Slug>-<version>-source.zip`      | Exact release-commit source archive.                   |
| `SHA256SUMS.txt`                   | SHA-256 checksums of distributed files.                |

For both feeds verify version, the exact filename in every `files[]` entry,
legacy `path` if present, and SHA-512 against the actual Setup or AppImage.
Never offer Portable or RPM in these feeds. Retain generated blockmaps when
present; current clients request full downloads. Do not silently enable
differential updating. For additional architectures, design/test matching
metadata and native helpers; do not relabel an x64 package as arm64.

Branches are not update feeds. Require a tag at the exact authorized
release-branch tip, a public non-draft GitHub Release selected as Latest, and
the GitHub prerelease flag off. Keep forward-only SemVer ordering even if the
version contains `-oem.1`; verify actual `latest` channel metadata rather
than assuming a suffix chooses the right channel.

A private repository cannot serve anonymous installed clients. A different
public asset repository or independent host requires a separately authorized
publisher architecture, scoped CI credentials, revised repository guards,
provenance tests, and two-version update acceptance. Changing a URL alone is
insufficient. No token may enter product JSON, source, executables, or
`app-update.yml`. `NIUOFFICE_UPDATE_URL` is an optional validated build-time
override for an independent generic feed, not a workaround for private GitHub.
Keep both platform builds on the same approved public, stable URL.

The updater checks about 15 seconds after launch and every four hours while
running. Help → Check for Updates runs a manual check. It is inactive in
development, when updates are disabled, in Windows Portable, and in
non-AppImage Linux installs. AppImage eligibility uses the actual launcher's
`APPIMAGE` variable; do not fake that for RPM or extracted-folder installs.
Downloads require user action; downloaded updates may install on normal quit.
Test this behavior instead of promising silent background replacement.

## Adapt release automation in the distributor fork

NiuOffice OEM stays **source-only**. Inherited workflows deliberately refuse
OEM binary builds. Do not weaken them in `Niuulh/NiuOffice`; product JSON
alone does not finish downstream release setup.

In the distributor repository only:

1. Copy `.github/workflows/release-main.yml` to a client release workflow and
   `.github/workflows/build-packages.yml` to a client reusable package
   workflow. Update the copied release job's `uses:` to the copied package
   workflow. Keep inherited main-only workflows fail-closed or remove them
   from the downstream fork after reviewing triggers.
2. Adapt tag patterns/validation, branch refs, release titles, artifact
   upload/download patterns, concurrency labels, output directories, and
   provenance labels to approved client values. Remove the inherited
   `codex/niuoffice-*` and `0.*-niu.*` push patterns from the copied package
   workflow; use intended downstream events only.
3. Replace the copied **main-edition** guards with equally strict **OEM**
   guards: `edition === 'oem'`,
   `features.chatgptSubscription === false`, enabled updates for public
   releases, safe artifact slug, and the configured public repository exactly
   equal to `GITHUB_REPOSITORY`. Never enable ChatGPT just to pass a guard.
   Remove main-only signed-out ChatGPT/app-server/tool-host smoke steps from
   the copied OEM workflow; do not install a Codex runtime just to run them.
   Keep negative OEM runtime/dependency checks and endpoint integration tests.
4. Require the tag to equal `v<apps/shell/package.json version>` and resolve
   to the current authorized downstream release-branch tip. Re-fetch and
   re-check immediately before publishing. Require a strictly newer release;
   existing published assets stay immutable.
5. Adapt/copy `tools/assemble-release.mjs`, which currently rejects OEM, for
   the downstream product. Replace its main-only check with OEM/endpoint-only
   and approved-repository validation, not no validation. Preserve a clean
   committed tree, exact complete filenames, feed SHA-512 validation,
   exact-commit source archive, `BUILD-<platform>.txt` provenance, and
   checksums. Uncommitted source must never be labeled tagged source.
6. Keep `tools/audit-release.mjs` active: it already keys required runtime
   resources from the product flag and rejects OEM Codex. Continue requiring
   exactly Docs, Sheets, PDF, Markdown, HTML, local helpers/WASM/licenses, and
   absence of removed service wiring in compiled JavaScript and resources.
   Adapt only genuinely brand-specific assertions.
7. Keep `npm run check:oem-boundaries` and security tests. Its inherited
   main-workflow checks must still pass (preserve that workflow's restrictions
   or remove that inherited file). Add equivalent fail-closed tests for the
   copied downstream workflows and assembler. Never disable the entire gate
   because the OEM workflow differs from the personal workflow.
8. Replace hardcoded Fedora smoke-test `NiuOffice-*.rpm`,
   `/opt/NiuOffice`, and artifact-prefix literals with validated client
   values. Derive install paths from the RPM when possible; productName and
   executableName may differ. Retain x64 helper provenance and a Fedora
   install/launch test.
9. Verify public visibility, run full CI, and build Windows/Linux from the
   **same exact commit**. Validate Linux provenance against the Windows
   tag/version/commit, not merely artifact names or a job ID.
10. Revalidate both feeds and actual SHA-512s after assembling all platforms.
    Inspect packaged `app-update.yml` for the intended public generic URL.
    Require Setup, Portable, AppImage, RPM, both feeds, source, and checksums
    from the exact version. Fail on incomplete or mismatched sets.
11. Create a draft; upload the complete set; publish as Latest only after all
    gates and exact-branch/tag/forward-only rechecks pass. Never overwrite a
    published release. Failed drafts can be reconciled carefully but are not
    client update feeds.

Include downstream development/release branches in `.github/workflows/ci.yml`.
Install dependencies on each native host; never copy Windows `node_modules`
or helper binaries into Linux builds. Use the committed npm lockfile, pinned
workflow actions, Node 22 at least the repository engine minimum, and Rust.

These instructions do not authorize changing repository visibility, creating
releases, provisioning secrets, or uploading executables. The distributor must
authorize those actions. Upstream OEM publication remains source-only.

## Signing

Use a signing identity owned by the distributor. Store the certificate and
password only as protected CI secrets such as `WINDOWS_CSC_LINK` and
`WINDOWS_CSC_KEY_PASSWORD`; keep `CSC_IDENTITY_AUTO_DISCOVERY=false` so a build
host cannot silently select another identity. Never reuse or request the
BP Office maintainer's certificate.

After packaging, inspect both Windows executables with
`Get-AuthenticodeSignature` and inspect PE version information for the client
product/publisher/icon. If credentials were supplied, fail the workflow unless
the signature is valid and chains to the intended publisher. If the
distributor explicitly chooses unsigned builds, say `unsigned contributor
build` in release notes and expect Windows reputation warnings. Do not describe
an unsigned binary as production-signed.

The application ID and signing publisher should remain stable across releases.
A change can break trust, update application, or SmartScreen reputation and
must be handled as a planned migration rather than an ordinary rebrand.

## Required validation

Use npm, matching the committed `package-lock.json`:

```powershell
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
```

Run focused OEM tests while iterating:

```powershell
npm run test -w @genoffice/ai-provider -- tests/product-edition.test.ts tests/lmstudio.test.ts tests/chat.test.ts tests/stream.test.ts
npm run test -w @genoffice/shell -- tests/lmstudio-settings.test.ts tests/packaging-runtime.test.ts tests/product-identity.test.ts tests/brand-assets.test.ts tests/updater.test.ts
```

Adapt brand-specific expectations in `apps/shell/tests/brand-assets.test.ts`,
`product-identity.test.ts`, `packaging-runtime.test.ts`, and `updater.test.ts`.
Preserve their security, package-content, feed, and compatibility assertions.
Keep `tools/check-niuoffice-boundaries.mjs` functionally equivalent even if a
downstream fork renames the script: it must continue rejecting removed cloud,
search, Slides, analytics, MCP/headless/control/CLI services, and visible
upstream branding surfaces.

Build a local Windows validation package only in the downstream fork:

```powershell
npm run dist:win
```

Then verify:

- Setup and portable filenames use the client artifact slug and version.
- Setup contains `app-update.yml` with the intended public HTTPS feed when
  updates are enabled.
- Portable starts normally but never schedules or offers automatic updates.
- The executable, installer, taskbar, onboarding, Home, updater, Docs, Sheets,
  PDF, Markdown, and HTML use client art and copy in light and dark mode.
- Five tab-icon components (including the blue W), five Home SVGs, five native
  menu PNG pairs, and five file-association ICO/ICNS families were inspected
  separately; changing the app logo alone is not evidence of this work.
- The Home layout remains correct at `2048x1100` and `980x700`.
- PE product metadata, icon resources, and signature match the client.
- Packaged resources contain Docs, Sheets, PDF, Markdown, HTML, the xlsx
  sidecar, PDF/OCR/WASM resources, and required licenses, but no Slides module,
  `@openai/codex`, `native/codex*`, `@genspark/cli`, `packages/ai-search`, MCP,
  headless/control-server/CLI resources, or Genspark/AI Search runtime wiring.
- No external agent TCP listener, control socket, CLI discovery file,
  server-startup switch, server setup UI, or editor control hook returns.
- Local PDF→DOCX/XLSX, Find, Home local-file indexing, editor tools, and
  validated drop/open remain functional. Cover HTML/HTM and TSV as well as
  existing formats; reject PPTX and preserve attachment/image drop targets.
- Oversized input receives an actionable estimated-130K-context error;
  compaction/restoration and 200-turn limits remain enforced.
- A persisted or renderer-supplied `chatgpt`, retained-provider, or unknown
  active provider is migrated/rejected in favor of OpenAI Endpoint.
- Blank API keys make no network request. A valid per-client key appears as a
  Bearer header on every endpoint API request and never appears in UI errors,
  logs, screenshots, or test artifacts.

Review all matches rather than demanding a blind zero-result scan. Legal
files, internal `@genoffice/*` package IDs, compatibility metadata, disabled
shared source, and historical comments can legitimately contain old names;
visible or packaged product surfaces cannot.

## Linux and Fedora deployment

Build Linux packages on a Linux x64 host with Node 22, npm, Rust/Cargo, and
native build dependencies. The copied package workflow currently uses Ubuntu
22.04 with rpm/rpmbuild, libfuse2, Xvfb, GTK/NSS/audio/GBM libraries and XML
utilities, then validates RPM installation/launch in Fedora 44. A container
smoke pass is not a substitute for an actual Fedora desktop test.

After full validation, build the approved AppImage/RPM pair:

```sh
npm ci
npm run build:all
npm run notices
cd apps/shell
npx electron-builder --linux AppImage rpm --publish never
cd ../..
node tools/audit-release.mjs apps/shell/release
```

The Sheets build compiles its native spreadsheet sidecar. Do not package a
Windows sidecar for Linux. Root `npm run dist:linux` uses every configured
target (currently AppImage, DEB, RPM); use the explicit target command above
if only AppImage and RPM are approved. Neither command authorizes publication.

Deployment examples use placeholders. Substitute the exact client filenames
and verify `SHA256SUMS.txt` before launching:

```sh
# Actual AppImage, in a directory writable by the desktop user:
chmod +x "./ClientProduct-<version>-x86_64.AppImage"
"./ClientProduct-<version>-x86_64.AppImage"

# Fedora RPM: DNF resolves required native desktop dependencies.
sudo dnf install "./ClientProduct-<version>.x86_64.rpm"
```

For a missing `libfuse.so.2`, query Fedora's package manager with
`dnf provides '*/libfuse.so.2'` and install the matching trusted-repository
package. Do not run the GUI as root, make privileged FUSE workarounds, or
recommend `--no-sandbox` to end users. Extract-and-run can help diagnostics
but is not the AppImage launcher/update path; treat it as manual-only.

AppImage auto-update requires the actual launcher, its `APPIMAGE` variable,
a writable destination, and public `latest-linux.yml`. RPM does not
self-replace via electron-updater. Upgrade RPM with
`sudo dnf install "./ClientProduct-<new-version>.x86_64.rpm"` or a separately
configured, signed distributor DNF repository. A GitHub Release URL is not a
DNF repository.

Inspect `rpm -qip` and `rpm -qlp` before installation: package name,
version, architecture, vendor, dependencies, install path, desktop entry,
executable, icons, and licenses must match the client. After installation,
verify GNOME/KDE launcher/taskbar association, file-opening and all five
editors, light/dark mode, endpoint authentication, Wayland/X11 where supported,
and safe upgrade/uninstall preserving documents/settings. Check the Linux
icon set under `apps/shell/build/icons`, not only the Windows ICO.

SHA-256 detects mismatches but is not a distributor signature. Document the
Linux signing policy. RPM signing keys belong only in protected distributor
tooling. Record actual Fedora desktop/container versions and test results.

## Mandatory two-version update smoke test

Do not declare auto-update ready after inspecting only one build.

1. Publish a signed or explicitly unsigned downstream version A from the exact
   authorized release-branch tag. Confirm `latest.yml`, `latest-linux.yml`,
   Setup, Portable, AppImage, RPM, source, and checksums are anonymously
   downloadable and mutually consistent.
2. Install version A with the setup executable. Configure a test endpoint and a
   unique test-client API key. Verify all five editors can perform an AI request
   and the endpoint observes the Bearer header.
3. Create strictly newer version B without changing app ID, executable name,
   user-data directory, artifact slug, feed, or signing identity. Publish it
   from the exact next release-branch tag as the public Latest release.
4. Launch installed version A, wait through the initial update check, and
   confirm it offers version B. Download, restart/install, and verify the
   running version is B.
5. Confirm the endpoint configuration, per-client key, recent files, and editor
   settings survived the update. Repeat model discovery, streaming, vision, and
   a tool call; confirm every request still has the Bearer header.
6. Launch portable version A separately and confirm it does not show or apply
   the NSIS update. Downloading a new portable build remains a manual action.
7. Repeat the A→B update using the actual AppImage launcher as a normal Fedora
   desktop user. Confirm `latest-linux.yml` updates AppImage only and keeps
   settings. Install RPM A separately, confirm no AppImage updater is active,
   and upgrade to RPM B through DNF while preserving settings.
8. Confirm version B does not offer version A and the updater never permits a
   downgrade.
9. Repeat once with the endpoint offline, with an invalid key, and with a valid
   key. The UI must distinguish connection and authentication failures without
   exposing the key.

Capture the two tags, commits, feed URLs, artifact hashes, signature results,
and smoke-test outcome in the downstream release record. Do not put the test
API key in that record.

## Final source handoff checklist

Before handing the downstream source to its owner, report all of the following:

- Starting OEM commit and final downstream commit.
- Final product-config values, excluding secrets.
- Public update repository and authorized release branch.
- Version/tag and exact expected artifact filenames.
- Whether builds are signed, unsigned, or waiting for distributor credentials.
- Endpoint URL and key-provisioning method, but never the key.
- Test/build commands run and their results.
- Visual QA surfaces and resolutions checked.
- Archive negative-scan results, including compiled service wiring and no
  OEM Codex runtime.
- Windows/Linux provenance matching the exact source commit, actual feed
  SHA-512 checks, and SHA-256 asset checksums.
- Fedora desktop and RPM/AppImage results, distinguished from container-only
  CI smoke tests.
- Two-version updater smoke-test result, or a clearly assigned distributor
  action if releases were not authorized yet.
- Any intentionally retained internal compatibility names and why they remain.

If only source work was authorized, stop after pushing the downstream source
and reporting the remaining distributor-owned release actions. Do not create a
release, change repository visibility, provision secrets, or upload binaries
without explicit authority.
