# BP-Office Privacy

Last updated: August 26, 2026

BP-Office opens, edits, and saves documents locally. It contains no usage
analytics or telemetry pipeline and does not upload documents merely because
they are opened, edited, converted, or saved.

## AI connections

AI data leaves the application only when an AI provider is used:

- **LM Studio:** prompts, selected document context, attachments, and editor
  tool results are sent to the server URL configured by the user. The default
  is the loopback address `http://127.0.0.1:1234/v1`.
- **ChatGPT subscription:** prompts, selected document context, attachments,
  and editor tool results are sent to OpenAI through the bundled Codex
  app-server. Authentication and service usage are governed by OpenAI's terms
  and privacy policy.

BP-Office does not provide network web or image search, Genspark account or
cloud services, cloud projects, media analysis, transcription, or cloud file
conversion.

## Credentials and settings

An optional LM Studio token is stored with local AI settings. ChatGPT OAuth
credentials use an isolated BP-Office `CODEX_HOME` and operating-system secure
credential storage; they are not imported from Codex Desktop or Codex CLI.

Legacy Genspark authentication and cloud-project files are ignored and are not
deleted automatically. Users may remove those files manually from the legacy
`GenOffice` application-data directory after backing up anything they wish to
retain.

## Updates and external links

Checking for or downloading a BP-Office update contacts GitHub release
infrastructure. Opening an external link uses the system browser and contacts
that link's destination. Standard network metadata, including an IP address,
is necessarily visible to those services.

## Data not collected by BP-Office telemetry

Because BP-Office ships no telemetry pipeline, it does not send analytics
events containing document content, file names, file paths, account identity,
email addresses, device identifiers, usage events, or regional information.
