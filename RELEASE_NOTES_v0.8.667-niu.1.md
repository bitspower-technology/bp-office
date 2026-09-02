# NiuOffice 0.8.667-niu.1

This release adapts GenOffice v0.8.667 (`583a045212f871943afb8ca4503fcb5ddf99a23f`)
while preserving the local-first NiuOffice features from 0.8.358-niu.1.

## Upstream editor improvements

- Docs gains table styles and properties, automatic column fitting, repeated
  table headers, and improvements to document layout, image wrapping, charts,
  protected text, and OOXML compatibility.
- Sheets gains CSV export and in-place CSV saving, improved print settings,
  safer atomic saves, and fixes for charts, validation dropdowns, workbook
  formatting, embedded images, and rich-data preservation.
- Large scanned PDFs open at an appropriate fit-to-width zoom.
- Markdown prompts to save an untitled document before pasting local images.
- Korean fallback-font notices include corrected upstream copyright and
  Reserved Font Name attribution.

## NiuOffice features retained

- LM Studio is the default AI provider at `http://127.0.0.1:1234/v1`, with
  automatic model discovery and an optional token.
- ChatGPT subscription access uses browser OAuth, the pinned `@openai/codex`
  0.147.0 runtime, and an isolated NiuOffice data folder.
- The cyan–violet–pink gradient-outline NiuOffice branding remains throughout
  the app, installer, portable executable, taskbar, onboarding, and AI surfaces.
- Compatible Explorer file drops open in new tabs: `.docx`, `.xlsx`, `.xlsm`,
  `.xls`, `.csv`, `.pdf`, `.md`, and `.markdown`.
- Agent runs allow up to 200 tool turns, restore up to 512 messages, and use a
  1 MiB context budget approximating 256K tokens.
- Ordinary editor Find/search and local PDF-to-DOCX/PDF-to-XLSX conversion
  remain available.

## Features not included

Genspark sign-in, credits, cloud projects, cloud generation/conversion, proxy,
CLI, and analytics remain absent. Network AI Search, including web-search and
image-search tools, remains removed. Slides, `.pptx` opening and associations,
PDF-to-PPTX conversion, and the Slides-only downloadable-font catalog are not
shipped.

## Verification

Workspace typechecks, unit/native tests, all 39 Electron E2E tests, full builds,
formatting, theme-token checks, English-comment checks, license checks, and
product-boundary scans passed. Lint completed with no errors and 11 existing
hook warnings.

The packaged application was smoke-tested with an isolated profile: light/dark
Home layouts, all four editors, LM Studio offline status, ChatGPT signed-out
status, provider switching, and XLSX editing/saving through the packaged native
engine. Both executable archives passed integrity checks and contain identical
application payloads. Required runtime resources and licenses were verified.

LM Studio was not running on the build machine, so live model inference,
token-authenticated inference, and model-driven editor tool calls were not
tested against a real server. Those provider paths have automated mocked
coverage. ChatGPT runtime initialization was tested in an isolated signed-out
profile; no connected subscription session was exercised.

## Installation and integrity

The Windows installer and portable executable are unsigned contributor builds.
Windows may show a SmartScreen warning. Verify downloaded files against
`SHA256SUMS.txt` before running them.

The historical `com.genoffice.app` identity and `GenOffice` user-data directory
remain unchanged for upgrade compatibility. Legacy Genspark auth/project files
are ignored, not deleted; see the repository README for optional manual cleanup.
