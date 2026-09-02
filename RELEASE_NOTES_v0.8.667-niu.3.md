# NiuOffice 0.8.667-niu.3

Adds local PDF bookmark editing and renames the LM Studio-facing connection to
**OpenAI Endpoint** in the NiuOffice adaptation of GenOffice v0.8.667. No
GenOffice or Genspark account/cloud connection is required.

## OpenAI Endpoint

- Home, Settings, onboarding, status, validation, and translated provider copy
  now show **OpenAI Endpoint**.
- The default remains `http://127.0.0.1:1234/v1`, with automatic model
  discovery, manual model selection, and an optional bearer token.
- Existing settings continue to work because the internal `lmstudio` provider
  ID and migration format remain unchanged. LM Studio itself remains compatible,
  as do other OpenAI-compatible endpoints that expose `/v1/models`.

## Local PDF bookmarks

- `get_outline` now reports stable paths such as `1` and `1.2`, titles, and
  destination pages.
- The new `edit_bookmark` AI tool can create, rename/update, delete, move, and
  reorder PDF bookmarks without a GenOffice connection.
- Changes participate in the normal PDF undo, dirty-state, Save, Save As, page
  deletion, and post-save reload flows.
- Existing hierarchy, Unicode titles, bold/italic style, color, expanded state,
  and standard destination views are preserved. Unsafe external, malformed,
  oversized, or tagged-structure outlines fail closed rather than being
  rewritten lossily.

The supplied four-page PDF fixture was tested in memory: a Unicode bookmark
rename survived save/reopen and all four original `/FitH 846` destinations
were preserved. The original file was not modified.

## Privacy and security

PDF bookmark editing and the OpenAI Endpoint configuration are local. AI
content is sent only to the provider selected by the user. ChatGPT subscription
use still connects to OpenAI; configuring a remote OpenAI-compatible endpoint
sends requests to that endpoint. Slides, AI Search, Genspark cloud integration,
and analytics remain absent.

## Verification

- Formatting, lint, theme/comment checks, product-boundary checks, all workspace
  typechecks, affected unit suites, production builds, and targeted Electron
  end-to-end tests pass.
- The Electron bookmark test drives the real ChatGPT dynamic-tool bridge through
  `get_outline`, a Unicode rename, a second bookmark creation, explicit Save,
  and PDF.js reopen verification.
- Final package scans verify that only Docs, Sheets, PDF, and Markdown ship and
  that removed Slides, Genspark cloud, and AI Search resources remain absent.

## Downloads

Both Windows x64 executable builds are unsigned contributor builds; Windows may
display a SmartScreen warning. Check downloaded files against `SHA256SUMS.txt`.
The source ZIP corresponds to this release's exact Git tag.
