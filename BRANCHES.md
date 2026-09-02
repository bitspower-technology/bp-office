# BP Office branches and release discipline

This repository maintains exactly one active product branch: `main`. It is both the
development branch and the authorized release branch — the only commit allowed to
produce client binaries is the current tip of `main`.

## `main`: BP Office

`main` ships the endpoint-only OEM edition: OpenAI Endpoint is the single selectable
AI connection, and ChatGPT selection, authentication, IPC, and Codex runtime packaging
stay absent or disabled by the boundary gates in `tools/check-oem-boundaries.mjs` and
`tools/check-niuoffice-boundaries.mjs`.

Only `main` produces BP Office Windows binaries. A release tag must equal
`v<apps/shell/package.json version>` (for example `v1.0.0-bp.1`) and point at the
current `main` commit. [`.github/workflows/release-bpoffice.yml`](.github/workflows/release-bpoffice.yml)
verifies that relationship before publishing, then uploads:

- `BPOffice-Setup-<version>.exe` (the only asset `latest.yml` may reference)
- `BPOffice-Portable-<version>.exe` (manual updates only)
- `latest.yml`
- `SHA256SUMS.txt`
- `BPOffice-<version>-source.zip`

The installed setup build uses this repository's public GitHub Releases endpoint as its
update feed. Portable builds never run the automatic updater and must be replaced
manually.

An updater feed must be anonymously readable. Never put a GitHub token, personal access
token, or other repository credential in `branding/product.json`, an environment
override, the application source, or a packaged executable. If this repository were ever
made private, release assets would have to move to a separate public update repository
before the next updater-enabled build.

Versioning starts at `1.0.0-bp.1` with the first BP Office release; there is no legacy
BP Office install base to migrate, and upstream BP Office/GenOffice releases are a
different product line with their own tags and user-data directories.

## Signing

Releases are unsigned until Bitspower Technology provisions its own Windows code signing
certificate as `WINDOWS_CSC_LINK` / `WINDOWS_CSC_KEY_PASSWORD`. `CSC_IDENTITY_AUTO_DISCOVERY`
stays `false` so a build host can never silently pick a different identity, and the job
fails when credentials were supplied but the executables are unsigned. Unsigned builds are
described as `unsigned contributor build` in their release notes; never imply that an
unsigned binary is production-signed.

## Integrating upstream changes

Upstream work flows one way: shared changes land in the upstream BP Office `main`, are
integrated into its source-only `OEM` template branch, and are then merged or cherry-picked
into this repository.

1. Fetch the upstream template branch and merge it into a feature branch of `main`.
2. Resolve conflicts while preserving the BP Office identity in `branding/product.json`,
   the endpoint-only feature gates, and the distributor branding under `branding/`.
3. Re-run the shared CI suite plus both boundary checks (`npm run check:product-boundaries`
   and `npm run check:oem-boundaries`) before merging to `main`.
4. Regenerate brand assets only when master art changes, and regenerate third-party notices
   whenever dependencies change.

Never merge this repository back into the upstream template, and never publish BP Office
binaries or tags to an upstream repository.

## Release discipline

- A Git branch is not an update feed. Updaters consume release metadata and versioned
  assets from GitHub Releases.
- Publish release tags only from the current `main` commit, and only after CI is green.
- Keep artifact names stable and URL-safe. `latest.yml` must name the exact installer asset
  uploaded by the same release job, with a matching SHA-512.
- Never overwrite or delete the assets of an already published release; publish a new
  version instead.
- Run formatting, linting, typechecking, tests, builds, archive audits, and checksum
  generation before publishing.
- Before declaring auto-update ready, run the two-version smoke test described in
  [OEM_CUSTOMIZATION.md](OEM_CUSTOMIZATION.md): install version A, publish strictly newer
  version B from the next `main` tip tag, confirm the upgrade, the surviving per-client
  endpoint configuration, and that portable builds stay manual.
