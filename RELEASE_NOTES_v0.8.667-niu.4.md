# NiuOffice 0.8.667-niu.4

This release establishes the maintained `main` and `OEM` product tracks.

## Main edition

- Keeps both ChatGPT subscription and OpenAI Endpoint connections.
- Requires an OpenAI Endpoint API key and sends it as
  `Authorization: Bearer <api-key>` on model discovery and every AI request.
- Adds a guarded Windows release workflow that publishes Setup, Portable,
  updater metadata, checksums, and a tagged source archive only from the exact
  current `main` commit.
- Enables automatic updates for installed Setup builds through the configured
  public GitHub Releases feed. Portable builds remain manual-update-only.
- Removes the unsupported beta update selector.

## Distribution note

The updater feed must be publicly readable without credentials. The release
workflow intentionally refuses to publish while the configured update
repository is private. Existing `0.8.667-niu.3` installations require one
manual setup upgrade because that build did not contain updater metadata.

The `OEM` branch is source-only and contains its own rebranding and update-feed
runbook; NiuOffice does not publish OEM binaries.
