# Chatbox Venice

A local-first fork of [Chatbox Community Edition](https://github.com/chatboxai/chatbox), focused on Venice and configurable vendor APIs. GPL-3.0.

[Downloads and release notes](https://github.com/n3me5is-git/chatbox-venice/releases) · [Builds and logs](https://github.com/n3me5is-git/chatbox-venice/actions) · [Italiano](README.it.md)

## Downloads

The fork builds a Windows x64 setup and an Android APK. Download them from this repository's [latest release](https://github.com/n3me5is-git/chatbox-venice/releases/latest). Builds awaiting publication are available as artifacts inside each successful Actions run. This fork currently has no macOS, Linux, iOS or app-store packages.

Windows installers are unsigned. New versions use a release-mode APK signed for personal sideload installation. Keep the same signing key when updating an installed Android app; see [development and releases](docs/fork-development.md).

## Configure Venice

1. Open Settings → Providers → Venice and enter your API key.
2. Select Fetch to discover the current chat, image generation and image editing models directly from Venice. Add the models you want to use.
3. Choose a model for your chat or open Image Creator.
4. Configure native search in the chat's search panel or in Venice settings. Choose integrated Venice chat search, Brave, Google, Exa, or X search on compatible models. Modes are Off, Automatic and Always search. Automatic Brave/Google/Exa search requires tool calling; Always search also works without tools.
5. Open Venice image settings in Image Creator for moderation, output format, size, resolution, quality, seed, steps, CFG scale and other supported options. Editing models accept reference images. Model capabilities and constraints still apply.

Venice's integrated chat search and its standalone retrieval APIs expose different options. Brave/Google/Exa choices use Venice's `/augment/search` API directly; they are not Chatbox search providers. X search takes precedence when enabled. Search and prompt enhancement can incur additional Venice charges.

## Optional media and chat tools

Enable Audio/transcription, Video or Music/SFX in Settings → Providers → Venice. Open **Venice Studio** in the sidebar. Load the current catalog explicitly and choose models by name. Speech shows model-specific voices, compatible formats, language and speed; a short voice test runs only on an explicit click and may have a cost. Enter text or choose a transcription file. Cached catalog metadata can be reused locally. Technical IDs and JSON are under Advanced options. Model cards show supported options and documentation. Music/video controls follow the selected model; transcription can also record the microphone locally. Supported model options can be supplied as extra JSON. The app never automatically creates a paid job again after an error.

Video and music save their queue IDs locally. Resume retrieves the existing job after an interruption or app restart. Once downloaded and saved, the app requests remote cleanup; failures remain visible and can be retried. You can export media, remove the local entry or explicitly clean up the remote copy. Closing the app or stopping polling does not guarantee server cancellation or a refund. Files are limited to 25 MB for transcription and 128 MB for generated media.

The **Venice internal MCP** is available when Venice is configured and enabled; its switch is in Settings → MCP or the Venice provider. Use it to let Venice chat models discover, quote, generate and manage this chat's media. Venice approvals beside the chat balance select Ask every time, Remember similar generations after approval, or Automatically approve generations. Policies and image parameter defaults apply only to that chat until the app closes. Similar requests match tool, model and parameters while allowing a new prompt. Reset revokes them immediately. Unknown/ambiguous image models and required reference uploads still need human input; deletion always asks. Tools return metadata, not media blobs or API credentials. Existing local tools, MCP integrations and other providers retain their behavior. Media prompts and selected files go directly to Venice, without E2EE.

Save reusable search/image profiles in Venice provider settings, then select or override them per model or existing chat. Priority is provider → saved profile → model → chat → extra model request JSON. Permission switches remain provider-level. Turning Venice off blocks new Venice requests while preserving local history.

English is the source language for fork releases and UI. Fork controls use the existing translation resources and live language switching; missing new translations fall back to English. Core approval controls cover all 15 supported desktop locales. See [testing and localization](docs/fork-testing.md).

## Protected local storage and model privacy

Open **Settings → Data & Backup** to configure independent PIN/passphrase and biometric/device unlock, app-open/background locking, project locks, encrypted library backup/restore and cleanup. Image Creator and Studio have public/protected histories and a protection switch for new outputs. Native media is encrypted on disk and opened lazily; public library means no extra PIN. A project's lock guards access inside the app and does not encrypt the existing ordinary conversation database or external files. See [local protection and backup boundaries](docs/local-security.md).

Venice settings offer **Privacy Only**, optional TEE verification/text E2EE and **Show other models from Venice**. E2EE excludes tools, attachments and search. Attestation validates nonce/model/key bindings and signed replies; Intel/NVIDIA certificate verification relies on Venice's reported verdicts. Catalog badges show provider privacy/uncensored claims.

Studio separates music and sound effects, supports compatible voice cloning/conversion, and accepts recordings or existing local media. Clone-handle removal is local; server-side samples follow Venice's retention period. Image Creator/Studio remix and edit offer compatible models, batch controls, percent comment points and a local painted-area mask. Venice receives a context crop; masking is applied on-device.

## Extra request JSON for each custom model

Open a custom provider, create or edit a model, and use **Extra request JSON**. This object merges into the outgoing body after SDK serialization. Nested objects merge; arrays replace. `false`, `0` and `null` retain their meaning. Streaming remains controlled by Chatbox settings.

For a Venice image model through a custom OpenAI-compatible provider:

```json
{"moderation":"low"}
```

For a chat variant:

```json
{
  "model": "actual-remote-model-id",
  "venice_parameters": {
    "enable_web_search": "on",
    "enable_web_citations": true,
    "include_venice_system_prompt": false
  }
}
```

Give variants unique local Model IDs and put the real model ID in JSON's `model` field. Enable **Use provider native web search** to suppress Chatbox's external search tools for that model. Parameters and valid values are determined by your vendor; the editor validates JSON syntax, not every vendor schema. Native Venice image requests use `safe_mode`; the OpenAI-compatible image endpoint uses `moderation: "auto" | "low"`.

## Local data and privacy

Chat history, generated images and API settings are stored on the device. Image Creator's Delete action removes the local record, aborts an active generation, and cleans up image blobs that are no longer referenced. Explicit file exports remain where you saved them.

Venice chat, search and image requests go directly to Venice; there is no fork-operated relay or backend. Prompts and selected reference files must be sent to Venice for inference. Search providers may receive queries through Venice. Standard requests use HTTPS; compatible text models can require TEE verification or E2EE in provider settings. Media endpoints do not use text E2EE.

Tracking and error reporting default to disabled. Local document parsing is the desktop default; mobile defaults to no cloud parser. You can explicitly configure other providers, MCP servers, parsers or optional upstream Chatbox services, each with its own data destination. Existing imported preferences are preserved. See [privacy and data flows](docs/fork-privacy.md).

## Development

Development, tests, Windows packaging and Android compilation can all run on GitHub. A local Android SDK, Java or signing tools are not required. See [development and releases](docs/fork-development.md) for the workflow and optional local development.

[Changelog](CHANGELOG.md) · [Upstream source and license](https://github.com/chatboxai/chatbox) · [Venice CLI reference](https://github.com/veniceai/venice-cli) · [Venice MCP reference](https://github.com/veniceai/venice-mcp-server)

The external Venice MCP server can also be configured explicitly; it is not installed automatically or given your API key. The fork's internal MCP runs inside the app.
