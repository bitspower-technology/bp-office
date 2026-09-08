# NiuOffice 0.8.970-niu.1

This NiuOffice source version is adapted from the exact GenOffice
`v0.8.970` release at commit
`93b8938c456eb1194ad8dc505ec5d1398f4e5654`.

## Retained upstream improvements

- Docs preserves more paragraph and table formatting during AI edits, renders
  comment balloons and page borders in print/PDF output, improves large-file
  export, and includes the latest cross-page table, section-margin, CJK,
  VML-picture, and chart fidelity fixes.
- Sheets can merge or attach workbooks, adds Excel-style navigation and
  shortcuts, and includes the latest formula, conditional-formatting, pivot,
  chart, right-to-left, streaming, and save-fidelity work.
- The upstream agent-loop reset, repetition protection, overload reporting,
  and OpenAI-compatible streamed tool-call fixes are retained while keeping
  NiuOffice's expanded agent limits.

## NiuOffice product boundaries

- The `main` edition supports ChatGPT subscription and OpenAI Endpoint. OpenAI
  Endpoint requires a client API key and sends it as
  `Authorization: Bearer <api-key>` for model discovery and every AI request.
- Genspark sign-in, cloud projects and media operations, AI Search, telemetry,
  Slides, `.pptx` opening paths, and Slides packaging remain removed.
- The supplied NIUU artwork remains the application, installer, taskbar,
  Home, onboarding, updater, and editor AI identity.
- Docs, Sheets, PDF, and Markdown document-tab badges are treated as separate
  branding assets from the main application logo. Their inline shell icons,
  Home/recent-file tiles, menu images, and operating-system association icons
  must be audited together; no Slides badge or association is shipped.
- PDF local document tools, including bookmark creation and editing, Explorer
  drag-and-drop tab opening, and the 200-tool-turn/approximately 256K-token
  context policy remain available.

## Intended Windows artifacts

The release pipeline is configured to produce:

- `NiuOffice-Setup-0.8.970-niu.1.exe`
- `NiuOffice-Portable-0.8.970-niu.1.exe`
- `NiuOffice-Setup-0.8.970-niu.1.exe.blockmap`
- `NiuOffice-0.8.970-niu.1-source.zip`
- `latest.yml`
- `SHA256SUMS.txt`

This version is being prepared as a local unsigned contributor build. It is
not published because the configured `Niuulh/NiuOffice` repository and updater
feed are private. The guarded release workflow intentionally refuses to
publish until the feed is anonymously readable. Portable builds remain
manual-update-only.

Existing `0.8.667-niu.3` installations predate updater metadata and therefore
need one manual installation of the first published updater-enabled Setup
build. Subsequent installed versions can use the public GitHub Releases feed
without embedding a repository credential.

The `OEM` branch remains source-only and endpoint-only. Its downstream
rebranding runbook identifies the independent document-tab and file-type icon
surfaces in addition to the main generated application artwork.
