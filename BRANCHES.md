# NiuOffice release tracks

This repository maintains exactly two active product branches: `main` and
`OEM`. They share the editor codebase but intentionally have different AI and
release contracts. Historical branches may remain available for reference;
they are not maintained release tracks.

## `main`: personal edition

`main` is the canonical development branch and contains both supported AI
connections:

- OpenAI Endpoint, including local LM Studio-compatible servers.
- ChatGPT subscription through the pinned, isolated Codex app-server runtime.

Only `main` produces official NiuOffice Windows binaries. A release tag must
match the version in `apps/shell/package.json` and point at the current `main`
commit. The release workflow verifies that relationship before publishing:

- `NiuOffice-Setup-<version>.exe`
- `NiuOffice-Portable-<version>.exe`
- `latest.yml` and any updater sidecar metadata
- `SHA256SUMS.txt`
- the complete source archive

The installed setup build uses the configured public GitHub Releases endpoint
as its update feed. Portable builds do not run the automatic updater and must
be replaced manually.

An updater feed must be anonymously readable. Do not put a GitHub token,
personal access token, or other repository credential in the application. If
the source repository is private, configure a separate public repository for
release assets before producing the first updater-enabled build.

The already-published `0.8.667-niu.3` build contains no updater feed metadata.
Existing users must install the first updater-enabled setup build manually;
automatic updates can work for subsequent releases.

## `OEM`: endpoint-only source edition

`OEM` is the distributable source template. It exposes only OpenAI Endpoint;
ChatGPT selection, authentication, IPC, runtime packaging, and editor routing
must remain absent or disabled by the OEM gates. The branch contains
`OEM_CUSTOMIZATION.md`, which is the authoritative runbook for an AI agent
that applies a distributor's branding, identity, public update repository,
and signing configuration.

The NiuOffice repository pushes source changes to `OEM` but never builds,
tags, releases, or uploads OEM executables. Each distributor owns its distinct
application identity and release feed and builds the branded artifacts in its
own repository.

## Integrating changes

For a change that applies to both editions:

1. Implement and validate it on `main`.
2. Merge `main` into `OEM`; do not rewrite or rebase the published branch.
3. Resolve the merge while preserving the OEM endpoint-only feature gates,
   identity configuration, and customization guide.
4. Run the shared CI suite plus the OEM negative checks before pushing `OEM`.

Changes that depend on ChatGPT or the NiuOffice release service stay on
`main` unless an explicit OEM-safe implementation is designed. Do not merge
`OEM` wholesale back into `main`; promote individual OEM fixes through a
reviewed `main` change instead.

## Release discipline

- A Git branch is not an update feed. Updaters consume release metadata and
  versioned assets from GitHub Releases.
- Publish NiuOffice release tags only from the current `main` commit. `OEM`
  must never publish to the NiuOffice feed.
- Keep artifact names stable and URL-safe. `latest.yml` must name the exact
  installer asset uploaded by the same release job.
- Run formatting, linting, typechecking, tests, builds, archive audits, and
  checksum generation before publishing.
- Unsigned contributor builds must be identified as unsigned in their release
  notes. Never imply that an OEM distributor's build is signed by NiuOffice.
