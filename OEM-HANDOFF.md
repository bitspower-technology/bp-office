# NiuOffice OEM source handoff

- Prepared: 2026-09-29
- Branch: `OEM`, verified against `origin` on GitHub
- Exact commit: `dd6d31f343a2bd99092950cf0b9ade5b9bf29837`
- Source version: `0.10.1467-niu.1` (the current OEM version, not main's ChatGPT build)
- Archive: `NiuOffice-OEM-0.10.1467-niu.1-source.zip`
- Size: 29,953,123 bytes
- SHA-256: `022e8b19a47e5e4c6c67fc7ab053f05952e1473a68f230ffb2e095a7ec834634`

## Start here

Read `AGENTS.md`, `CLAUDE.md`, and the complete `OEM_CUSTOMIZATION.md` before editing.
The runbook includes application logos, all five independent document-tab
icons (including the blue W), Home/menu/file-association icons, per-client API
keys, Windows/Linux packaging, and public-repository auto-update deployment.

This is an unchanged source template, not an installer or a newly rebranded
client build. It uses OpenAI Endpoint only. ChatGPT is disabled, and the Codex
runtime is absent from the dependency manifests/lockfile. Shared disabled
provider source remains part of the repository. Every endpoint request requires
a non-empty per-client Bearer API key; no client key is supplied in this handoff.

Automatic updates remain disabled until the distributor configures its own
public release repository and validates the two-version update workflow.
The distributor must provide branding, application identity, repository,
endpoint/provisioning policy, and signing decisions before release. Do not
publish OEM binaries to Niuulh/NiuOffice.

## Verification performed

- ZIP CRC verification passed.
- All 3,439 archived files match their exact Git blob at the stated commit.
- All source, assets, lockfile, workflows, agent instructions, and legal notices
are included; Git history, local credentials, installed dependencies, and
generated application packages are not included.
- `node tools/check-oem-boundaries.mjs` passed on the extracted archive.
- `node tools/check-niuoffice-boundaries.mjs` passed on the extracted archive.
- No source or branch was changed and no release was published.

Full builds and end-to-end tests were not rerun for this archive-only request.
The previously recorded Sheets typing/save-path E2E failures remain unresolved;
this handoff does not claim full spreadsheet or distributor-release acceptance.

SHA-256 verifies file integrity; it is not a code-signing signature.
