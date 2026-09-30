# OEM agent entrypoint

Before substantive work, read `CLAUDE.md` and the complete
`OEM_CUSTOMIZATION.md`. That runbook is the rebranding, packaging, and public
updater execution contract; inspect current source before applying it.

- This upstream `OEM` branch is source-only. Do not publish OEM executables or
  tags to `Niuulh/NiuOffice`, and do not change `main`, `GPT`, or
  `feat/lmstudio-provider` while adapting a distributor fork.
- Keep `edition: oem`, ChatGPT disabled, and OpenAI Endpoint as the only
  selectable/executable provider. Every endpoint API request requires the
  client's non-empty Bearer key. Never commit or log credentials.
- Retain Docs, Sheets, PDF, Markdown, HTML, the estimated 130K context budget,
  and 200-turn limit. Do not restore Slides, Genspark cloud, network AI Search,
  analytics, MCP, headless/control servers, CLI bridges, or Codex binaries.
- Rebranding includes the five independent document-kind tab icons (the blue
  W is `DocIcon` in `TabBar.tsx`), Home SVGs, native-menu PNGs, and file
  association icons—not just the application logo. Follow the full asset map.
- Request missing client identity/repository/signing/provisioning decisions;
  never guess them. Downstream binary release setup must explicitly adapt
  both workflow and assembler guards without enabling ChatGPT. Preserve
  public same-repository feeds, immutable exact-commit assets, platform hashes,
  and the Windows Setup/Linux AppImage two-version update tests.
- Preserve user edits, internal compatibility identifiers and legal notices.
  Run OEM/product boundary gates plus required tests/builds; distinguish
  verified results from outstanding distributor-owned release actions.
