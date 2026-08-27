# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/BP-Arnaud/bp-office/security/advisories/new).
Do not open public issues for security reports.

## Process security posture

All application windows use Electron renderer lockdown:

- `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` for
  every shipped document window and tab view.
- Renderers reach the main process only through typed, validated IPC channels.
- External URLs pass through `@genoffice/electron-utils` URL validation and a
  protocol allowlist. `file:`, `javascript:`, and unapproved custom schemes are
  rejected.
- Explorer file drops are validated in the main process as absolute regular
  files, deduplicated, and limited to supported formats and bounded batches.
- No API key is hardcoded. LM Studio's optional token remains in local settings.

The `@genoffice/*` package names and `GenOffice` user-data directory are
retained compatibility identifiers, not cloud-service connections.

## AI provider boundaries

### LM Studio

BP-Office sends AI traffic only to the configured server. The default is the
loopback endpoint `http://127.0.0.1:1234/v1`; users who configure a remote URL
are responsible for that server and transport. No authorization header is sent
when the optional token is blank.

### ChatGPT subscription

ChatGPT authentication is handled in the main process through an allowlisted
OAuth flow and an isolated BP-Office `CODEX_HOME`. App-server threads are
ephemeral and sandboxed. The runtime's shell, filesystem, browser, network
search, apps, plugins, connectors, image generation, computer control, and
subagent capabilities are disabled. Only schema-validated editor tools are
bridged dynamically, and operations support cancellation.

Treat model output and document content as untrusted. Editor tools validate
their input before applying changes, while snapshots and ordinary save paths
provide recovery for supported edits.

## Out of scope

- Security or availability of LM Studio, OpenAI, GitHub, or another configured
  external service.
- Vulnerabilities requiring an already-compromised machine or a modified
  executable.
- Deliberate local-development path overrides such as `XLSX_SIDECAR_PATH`,
  which require control of the process environment.
- Standalone source that is not built, reachable, or packaged in BP-Office,
  including the retained upstream Slides application.
