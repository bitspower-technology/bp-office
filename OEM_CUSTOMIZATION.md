# OEM rebranding and update setup runbook

This document is an execution contract for an AI coding agent adapting the
`OEM` branch for one distributor. Read the current repository before editing,
make evidence-based changes, and stop if a required input is missing. Never
guess an application identity, repository, signing identity, endpoint, or
customer credential.

The BP Office `OEM` branch itself is source-only. Do not tag it, publish an OEM
release from it, or upload OEM executables to `Niuulh/BP Office`. A distributor
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
- Slides, Genspark cloud integration, AI Search, and telemetry stay absent from
  the shipped product.
- The independent application identity and user-data directory are chosen
  before the first release and are not changed afterward.
- Installed builds update only from an anonymously readable public release
  feed controlled by the distributor. Portable builds remain manual-update
  only.
- Apache-2.0 attribution, `LICENSE`, `NOTICE`, third-party notices, font
  licenses, and historical legal attribution are preserved.

If a requested customization conflicts with one of these invariants, report
the conflict instead of weakening the invariant.

## Required inputs

Obtain and record the following values before changing source. Placeholders
are not acceptable in a release commit.

| Input                           | Requirement                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Product name                    | Exact user-facing desktop application name.                                                       |
| AI name                         | Exact user-facing assistant name, normally `<Product> AI`.                                        |
| Vendor/publisher                | Legal distributor or contributor name shown in package metadata.                                  |
| Application ID                  | A vendor-owned, unique, reverse-DNS ID such as `com.example.product`.                             |
| Artifact slug                   | URL-safe filename prefix matching `[A-Za-z0-9][A-Za-z0-9._-]*`; no spaces.                        |
| Executable name                 | Stable, filesystem-safe executable basename, preferably lowercase.                                |
| Desktop name                    | Stable Linux desktop ID, normally `<executable>.desktop`.                                         |
| User-data directory             | Unique production directory under the OS application-data root.                                   |
| Development user-data directory | Separate unique directory for development builds.                                                 |
| Source repository               | Distributor-owned source fork URL.                                                                |
| Public update repository        | GitHub owner/name whose Releases and assets are public without authentication.                    |
| Release branch                  | Branch whose exact tip is allowed to produce client binaries.                                     |
| Version and tag policy          | Valid SemVer plus an exact matching tag, for example `1.0.0-oem.1` and `v1.0.0-oem.1`.            |
| Default endpoint URL            | OpenAI-compatible HTTP(S) base, normally ending in `/v1`; hosted services must use HTTPS.         |
| API-key provisioning policy     | How each client receives and enters its unique key; do not request the key value for source work. |
| Logo source                     | Trusted SVG/vector source, wordmark, palette, background treatment, and safe-zone rules.          |
| Support/security URLs           | Public support, security-reporting, privacy, and community links.                                 |
| Signing policy                  | Windows certificate owner and CI secret names, or an explicit unsigned-build decision.            |

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
  `apps/pdf/package.json`, and `apps/markdown/package.json` when applicable.
- `packages/electron-utils/src/github-menu.ts`, whose star/repository URL is
  currently a literal.
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
- Docs and Sheets main-process request handlers constrain renderer-supplied
  settings again instead of trusting the renderer.
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
  Sheets, PDF, and Markdown AI surfaces. It must render the client mark. The
  internal exported function name may remain `BP OfficeMark`; renaming it is
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
rg -n "BP Office AI|BP Office|Niuulh/BP Office" apps packages branding *.md package.json
```

At minimum, inspect these visible surfaces:

- Shell Home, onboarding, settings, update window, star prompt, HTML titles,
  tab labels, and all shell locales under `apps/shell/src/renderer`.
- Docs AI/ribbon locale files and prompts under
  `apps/docs/src/renderer`.
- Sheets AI panel, ribbon, locale strings, and prompts under
  `apps/sheets/src/renderer`.
- PDF AI panel, ribbon locales, annotation defaults where user-visible, and
  `apps/pdf/src/renderer/ai/pdf-skill.ts`.
- Markdown ribbon, AI panel, HTML title, and
  `apps/markdown/src/renderer/ai/markdown-skill.ts`.
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
- Do not reintroduce Genspark, AI Search, Slides, `.pptx` associations, cloud
  tools, analytics, or removed environment variables while resolving merges.
- Never reuse BP Office's app ID, user-data directory, repository, update feed,
  logo, signing identity, or release tag namespace for an independent client.

When a visible string and an internal compatibility identifier use the same
word, change only the visible occurrence and add a focused test.

## Configure the public update feed

Electron-updater uses a generic provider baked by
`apps/shell/electron-builder.cjs`. The final feed URL must be HTTPS, must not
contain credentials/query/fragment, and must allow a signed-out client to
download at least:

- `latest.yml`
- `<ArtifactSlug>-Setup-<version>.exe`
- the setup blockmap if differential download is later enabled

`latest.yml` must identify the exact setup filename and matching SHA-512 from
the same release. It must never offer the portable executable. Upload the
portable executable and `SHA256SUMS.txt` for manual downloads, but the portable
launcher intentionally disables automatic updating.

GitHub branches are not update feeds. A release must be created from a tag
whose commit is the exact authorized release-branch tip, and the GitHub Release
must be public, published (not draft), non-prerelease for the stable channel,
and selected as Latest. Test every feed URL in a signed-out browser or an
unauthenticated HTTP client.

A private GitHub repository cannot serve installed clients anonymously. Use a
public distribution repository, or a separate public release repository with
a dedicated CI publisher. A repository token may be held by CI to upload
assets, but it must never enter `branding/product.json`,
`NIUOFFICE_UPDATE_URL`, `app-update.yml`, application source, or an executable.

`NIUOFFICE_UPDATE_URL` is an optional build-time override for an independently
hosted generic feed. Prefer the repository-derived URL when using GitHub
Releases. If an override is necessary, its validation requirements are the
same and it must be stable across releases.

## Adapt release automation in the distributor fork

`.github/workflows/release-main.yml` belongs to the BP Office personal edition.
It deliberately rejects `edition: oem`, requires ChatGPT support, requires the
tag to equal BP Office `main`, and uses BP Office release titles. Do not weaken
that workflow on the BP Office branch.

In the downstream repository, copy it to a clearly client-owned workflow and
adapt it with all of these fail-closed checks:

1. Trigger only the distributor's tag pattern or an explicitly supplied tag.
2. Check out the tag with full history.
3. Require the tag to match `v<apps/shell/package.json version>`.
4. Require the tag commit to equal the current authorized downstream release
   branch tip.
5. Require `branding/product.json` to have `edition: oem`,
   `chatgptSubscription: false`, `updates.enabled: true`, a safe artifact slug,
   and the exact intended public update repository.
6. Verify the configured repository is public before building.
7. Run npm CI installation, product-boundary checks, formatting, lint,
   typechecking, unit tests, builds, and the OEM negative gates.
8. Build with the validated feed URL and with signing secrets supplied only by
   GitHub Actions.
9. Require the setup EXE, portable EXE, and `latest.yml`; validate that feed
   version, filename, and hash agree and that packaged `app-update.yml` points
   at the public generic feed.
10. Audit the package for no Codex runtime, Slides module, Genspark resources,
    or AI Search resources.
11. Generate SHA-256 checksums and a source archive from the exact tag.
12. Create a draft, upload the immutable asset set, then publish it as Latest
    only after every check passes. Never overwrite assets of an already
    published release.

Update `.github/workflows/ci.yml` in the downstream repository so both its
development branch and authorized release branch run CI. The BP Office
branch remains source-only; these downstream workflow instructions do not
authorize publishing OEM binaries to the BP Office repository.

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
search, Slides, analytics, and visible upstream branding surfaces.

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
  PDF, and Markdown use the client art and copy in light and dark mode.
- The Home layout remains correct at `2048x1100` and `980x700`.
- PE product metadata, icon resources, and signature match the client.
- Packaged resources contain Docs, Sheets, PDF, Markdown, the xlsx sidecar,
  PDF/OCR/WASM resources, and required licenses, but no Slides module,
  `@openai/codex`, `native/codex*`, `@genspark/cli`, `packages/ai-search`, or
  Genspark/AI Search runtime resources.
- A persisted or renderer-supplied `chatgpt`, retained-provider, or unknown
  active provider is migrated/rejected in favor of OpenAI Endpoint.
- Blank API keys make no network request. A valid per-client key appears as a
  Bearer header on every endpoint API request and never appears in UI errors,
  logs, screenshots, or test artifacts.

Review all matches rather than demanding a blind zero-result scan. Legal
files, internal `@genoffice/*` package IDs, compatibility metadata, disabled
shared source, and historical comments can legitimately contain old names;
visible or packaged product surfaces cannot.

## Mandatory two-version update smoke test

Do not declare auto-update ready after inspecting only one build.

1. Publish a signed or explicitly unsigned downstream version A from the exact
   authorized release-branch tag. Confirm `latest.yml`, setup, portable, source,
   and checksums are anonymously downloadable.
2. Install version A with the setup executable. Configure a test endpoint and a
   unique test-client API key. Verify all four editors can perform an AI request
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
7. Confirm version B does not offer version A and the updater never permits a
   downgrade.
8. Repeat once with the endpoint offline, with an invalid key, and with a valid
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
- Archive negative-scan results.
- Two-version updater smoke-test result, or a clearly assigned distributor
  action if releases were not authorized yet.
- Any intentionally retained internal compatibility names and why they remain.

If only source work was authorized, stop after pushing the downstream source
and reporting the remaining distributor-owned release actions. Do not create a
release, change repository visibility, provision secrets, or upload binaries
without explicit authority.
