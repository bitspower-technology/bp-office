# NiuOffice 0.8.358-niu.1

This release adapts GenOffice v0.8.358 (`9711a4507cf70d32610ffd423b5915c423f4a682`)
into a local-first NiuOffice build.

## Highlights

- LM Studio is the default AI provider at `http://127.0.0.1:1234/v1`, with
  automatic model discovery and an optional token.
- ChatGPT subscription access is available through browser OAuth using the
  pinned `@openai/codex` 0.147.0 runtime and an isolated NiuOffice data folder.
- The supplied cyan–violet–pink gradient-outline NiuOffice mark is used by the
  app, installer, portable executable, taskbar, onboarding, and AI surfaces.
- Compatible local files dragged from Explorer open in new tabs. Supported
  extensions are `.docx`, `.xlsx`, `.xlsm`, `.xls`, `.csv`, `.pdf`, `.md`, and
  `.markdown`.
- Agent runs allow up to 200 tool turns, restore up to 512 messages, and use a
  1 MiB context budget approximating 256K tokens.

## Removed from this build

- Genspark sign-in, credits, cloud projects, cloud generation/conversion, proxy,
  CLI, and analytics integration.
- Network AI Search, including web-search and image-search tools.
- The Slides application, `.pptx` opening/association path, and PDF-to-PPTX
  conversion.

Ordinary editor Find/search remains available. Local PDF-to-DOCX and
PDF-to-XLSX conversion remains available.

## Installation and integrity

The Windows installer and portable executable are unsigned contributor builds
because NiuOffice code-signing credentials were not configured. Windows may
show a SmartScreen warning. Verify the downloads against `SHA256SUMS.txt`
before running them.

The historical `com.genoffice.app` identity and `GenOffice` user-data directory
remain unchanged for upgrade compatibility. Legacy Genspark auth/project files
are ignored, not deleted; see the repository README for optional manual cleanup.
