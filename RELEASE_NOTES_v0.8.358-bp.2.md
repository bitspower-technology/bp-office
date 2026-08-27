# BP-Office 0.8.358-bp.2

Delta build on top of 0.8.358-bp.1 (same GenOffice v0.8.358 base,
`9711a4507cf70d32610ffd423b5915c423f4a682`).

## Changes in this build

- ChatGPT is removed from the AI provider list. The settings pane and
  onboarding now offer LM Studio only; LM Studio behavior is unchanged
  (default `http://127.0.0.1:1234/v1`, automatic model discovery, optional
  token). A legacy saved ChatGPT selection is migrated to LM Studio on load
  and its stored settings are preserved, never deleted.
- Branding assets are taken from the bitspower-technology/bp-office repo:
  exe/installer/taskbar icon (icon.ico/icon.png), macOS icon (icon.icns,
  regenerated as a standard PNG-based ICNS from the 1024px mark), onboarding
  logo, sidebar BP mark, and home-screen file-type icons.

Everything else matches 0.8.358-bp.1: local-first build with Genspark
sign-in/credits/cloud features, network AI Search, and the Slides app
removed; LM Studio agent runs allow up to 200 tool turns, restore up to 512
messages, and use a 1 MiB context budget approximating 256K tokens.
