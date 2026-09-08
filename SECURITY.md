# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/bitspower-technology/bp-office/security/advisories/new).
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
- No API key is hardcoded. The required OpenAI Endpoint key remains in local settings.

The `@genoffice/*` package names and `GenOffice` user-data directory are
retained compatibility identifiers, not cloud-service connections.

## AI provider boundaries

### OpenAI Endpoint

BP Office sends AI traffic only to the configured server. The default is the
loopback endpoint `http://127.0.0.1:1234/v1`; users who configure a remote URL
are responsible for that server and transport. The default and native model
discovery path remain compatible with LM Studio. No authorization header is
sent until a non-empty API key has been configured because BP Office blocks
the request entirely; afterward every endpoint request carries that key as a
Bearer authorization header.

### OEM provider boundary

The OEM edition enables only OpenAI Endpoint. Its settings migration and
main-process request handlers reject or remap ChatGPT, retained cloud-provider,
and unknown active provider IDs to the endpoint. ChatGPT selection and OAuth
IPC are not registered, and neither `@openai/codex` nor a native Codex runtime
is packaged. The OEM boundary check fails CI if those controls regress.

Treat model output and document content as untrusted. Editor tools validate
their input before applying changes, while snapshots and ordinary save paths
provide recovery for supported edits.

## Out of scope

- Security or availability of a configured OpenAI Endpoint, OpenAI, GitHub, or
  another external service.
- Vulnerabilities requiring an already-compromised machine or a modified
  executable.
- Deliberate local-development path overrides such as `XLSX_SIDECAR_PATH`,
  which require control of the process environment.
- Standalone source that is not built, reachable, or packaged in BP Office,
  including the retained upstream Slides application.
