# NiuOffice 0.10.1467 build and delivery

Base: upstream GenOffice tag `v0.10.1467`, commit
`dfe2a6d954f7c6486ad08f09727cae91f175ff7a`.
Application version: `0.10.1467-niu.1`.

`main` includes ChatGPT subscription and OpenAI Endpoint. `OEM` is endpoint-only
source; use its `OEM_CUSTOMIZATION.md` before creating a downstream deployment.
The public NiuOffice release workflow refuses OEM binary publication.

## Requirements

- Node.js 22.12+ and npm 10+.
- Stable Rust/Cargo with the native target toolchain; Windows requires the
  Visual Studio C++ build tools.
- Build on the target operating system and architecture. The pinned ChatGPT
  runtime is platform-specific; never copy Windows dependencies to Linux.
- A clean checkout and `npm ci`. Do not mix npm and pnpm dependency trees.
- Linux builds need the usual Electron libraries, `libfuse2` for AppImage
  tooling on Ubuntu, and `rpm` for the Fedora package. The maintained workflow
  installs them on Ubuntu 22.04 and packages Linux x64.

## Validate and package

```sh
npm ci
npm run check:product-boundaries
npm run typecheck
npm test
npm run build:all
npm run notices
```

On Windows, run `npm run dist:win`. This creates Setup and Portable executables
under `apps/shell/release`. On Linux, run the following after the common steps:

```sh
cd apps/shell
npx electron-builder --linux AppImage rpm --publish never
cd ../..
node tools/audit-release.mjs apps/shell/release
xvfb-run --auto-servernum -- node tools/smoke-packaged-linux.mjs apps/shell/release/linux-unpacked
node tools/assemble-release.mjs apps/shell/release linux
```

Use `windows` instead of `linux` for the Windows assembly command. It produces
the exact-commit source archive, per-platform SHA-256 file, and build provenance.
Do not assemble a release with uncommitted changes: `git archive` includes only
the recorded commit, so it would not represent the compiled working tree.

The **Build main packages (Windows and Linux)** workflow can be dispatched from
`main` without a tag and without publishing to the update feed. Its artifacts
expire after 30 days; download and retain them with their provenance/checksums.

## Fedora use

The AppImage is a standalone Linux x64 application. Download it, verify its
SHA-256, mark it executable (`chmod +x NiuOffice-*.AppImage`), then launch it.
If Fedora reports a missing `libfuse.so.2`, install the FUSE 2 compatibility
package with `sudo dnf install fuse-libs` (see [Fedora's FUSE v2 package](https://packages.fedoraproject.org/pkgs/fuse/fuse-libs/)).
Extraction mode is also available, as described in the [AppImage FUSE guide](https://docs.appimage.org/user-guide/troubleshooting/fuse.html):

```sh
./NiuOffice-<version>-x86_64.AppImage --appimage-extract
./squashfs-root/AppRun
```

Do not routinely pass `--no-sandbox` on a desktop; that switch is used only in
the isolated CI smoke test. Keep the extracted tree together. For normal system
integration use the RPM: `sudo dnf install ./NiuOffice-<version>.x86_64.rpm`.
RPM upgrades are manual/package-manager driven; AppImage update behavior depends
on launching the actual writable AppImage, not an extracted tree.

## Publishing and auto-update

Only publish a tag whose commit is exactly the validated `main` tip and whose
version matches `apps/shell/package.json`. The **Release main (Windows and Linux)**
workflow builds/audits both platforms before publication and includes combined
checksums. Its forward-version and public-feed checks must remain enabled.

The current feed is derived from `branding/product.json`. It must be public and
anonymously downloadable. A private repository can store build artifacts, but
installed clients cannot use its feed without credentials; never embed a GitHub
token. Portable Windows builds remain manual-update-only. Contributor packages
are unsigned unless the release explicitly verifies and states otherwise.

## Removed features and context policy

No external MCP endpoint, headless server/export mode, automation CLI, cloud
login/media/search, Slides app, or analytics is shipped. Local Find, workbook
inspection, ordinary editor actions, and PDF conversion remain available. The
main-edition ChatGPT stdio bridge is internal and intentionally retained.

The context allowance is 130,000 estimated tokens (520,000 UTF-8 bytes); actual
provider/model limits can be smaller. Output-token settings are separate. The
agent retains the 200-tool-turn and 512-restored-message limits.

## OEM source delivery

Merge validated shared `main` changes into `OEM` without changing its endpoint-only
gates. Verify its product-boundary checks and tests, and push source only. Create
the source ZIP from that exact OEM commit; it must include `OEM_CUSTOMIZATION.md`,
this build guide, `branding/`, all source, lockfile, workflows, tests, and licenses.
Exclude dependencies, build outputs, credentials, and personal documents. Record
the OEM commit and SHA-256 beside the archive. Never put a customer API key in it.
