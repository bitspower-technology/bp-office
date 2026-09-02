# NiuOffice 0.8.667-niu.2

Fixes ChatGPT document tools in the NiuOffice adaptation of GenOffice v0.8.667.
No GenOffice/Genspark account or cloud connection is required.

## Fixed

- Includes the local `codex-code-mode-host` helper from the same pinned
  `@openai/codex` 0.147.0 runtime as the app-server.
- Enables that isolated helper so ChatGPT models using `exec` can invoke
  NiuOffice's document-reading and editing tools. This fixes PDF summaries
  reporting that the document-reading tool is unavailable.
- Detects missing runtime helpers before starting ChatGPT requests and reports
  an actionable incomplete-installation error.
- Packaging rejects absent, empty, or invalid helpers and mismatched runtime
  versions instead of silently producing an incomplete application.

## Privacy and security

The helper is local, not a GenOffice service or a system shell. Only declared,
validated NiuOffice editor tools are bridged to it. Shell/filesystem tools,
network search, browser, apps, plugins, connectors, image generation, computer
control, and subagents remain disabled. The existing empty workspace,
read-only sandbox, ephemeral threads, and isolated NiuOffice credentials remain.

ChatGPT still requires its own subscription sign-in and an internet connection
to OpenAI. LM Studio remains the local alternative. Slides, AI Search, Genspark
cloud integration, and analytics remain absent.

## Verification

The connected `gpt-5.6-sol` runtime successfully called both `get_outline` and
`read_pages` and returned a unique marker available only in the synthetic tool
result. No private user document or copied credential was used by this test.

- All 40 Electron end-to-end tests pass, including the local PDF outline/page
  tool round trip through the real renderer and IPC bridge.
- The packaged application also passed a live ChatGPT PDF test: `read_pages`
  extracted a unique marker from an actual synthetic PDF, and ChatGPT returned
  it correctly. This used the existing NiuOffice-connected account normally.
- Affected provider, shell, PDF, and agent-core unit suites, all workspace
  typechecks, formatting, lint, theme/comment checks, license checks, product
  boundaries, and all four editor builds pass.
- The exact pinned helper, including its packaged copy, passes isolation smoke
  tests: Node/browser/network globals are absent, Node/URL imports fail, and
  only declared test tools are exposed. These checks establish runtime-interface
  restrictions, not a guarantee against vulnerabilities in the V8 runtime.
- Packaged light/dark Home layouts, all four editors, and spreadsheet edit/save
  pass smoke checks. Both executable archives pass integrity checks and contain
  matching application payloads, required native resources, and licenses.
- Final archive scans find no Slides, AI Search, or Genspark cloud integration.

LM Studio was checked offline; loaded-model and token-authenticated LM Studio
sessions were not retested for this ChatGPT-only patch. The user's original PDF
was not available for inspection; the regression tests use synthetic PDFs.

## Downloads

Both Windows x64 executable builds are unsigned contributor builds; Windows
may display a SmartScreen warning. Check downloaded files against
`SHA256SUMS.txt`. The source ZIP corresponds to this release's exact Git tag.
