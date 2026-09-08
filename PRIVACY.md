# BP Office Privacy

Last updated: August 31, 2026

BP Office opens, edits, and saves documents locally. It contains no usage
analytics or telemetry pipeline and does not upload documents merely because
they are opened, edited, converted, or saved.

## AI connections

AI data leaves the application only when an AI provider is used:

- **OpenAI Endpoint:** prompts, selected document context, attachments, and editor
  tool results are sent to the server URL configured by the user. The default
  is the loopback address `http://127.0.0.1:1234/v1`, commonly used by LM
  Studio. Every endpoint API request includes the user-configured API key as a
  Bearer authorization header.

The OEM edition has no ChatGPT subscription connection and does not package
the Codex app-server runtime.

BP Office does not provide network web or image search, Genspark account or
cloud services, cloud projects, media analysis, transcription, or cloud file
conversion.

## Credentials and settings

The required OpenAI Endpoint API key is stored with local AI settings in the
application user-data directory. This file is not encrypted by BP Office. An
OEM distributor that requires keychain-backed or managed secret storage must
implement and disclose that separately. No API key is built into BP Office.

Legacy Genspark authentication and cloud-project files are ignored and are not
deleted automatically. Users may remove those files manually from the legacy
`GenOffice` application-data directory after backing up anything they wish to
retain.

## Updates and external links

Automatic updates are enabled and check this product's public GitHub Releases
feed (`https://github.com/bitspower-technology/bp-office/releases/latest/download`).
Checking for or downloading an update contacts that feed and nothing else; no account
identity is sent, and no repository credential is embedded in the application. Opening
an external link uses the system browser and contacts that link's destination. Standard
network metadata, including an IP address, is necessarily visible to those services.

## Data not collected by BP Office telemetry

Because BP Office ships no telemetry pipeline, it does not send analytics
events containing document content, file names, file paths, account identity,
email addresses, device identifiers, usage events, or regional information.
