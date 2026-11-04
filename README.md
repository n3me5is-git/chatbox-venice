# Chatbox Venice

A local-first fork of [Chatbox Community Edition](https://github.com/chatboxai/chatbox), focused on Venice and configurable vendor APIs. GPL-3.0.

[Downloads and release notes](https://github.com/n3me5is-git/chatbox-venice/releases) · [Builds and logs](https://github.com/n3me5is-git/chatbox-venice/actions) · [Italiano](README.it.md)

## Downloads

The fork builds a Windows x64 setup and an Android APK. Download them from this repository's [latest release](https://github.com/n3me5is-git/chatbox-venice/releases/latest). Builds awaiting publication are available as artifacts inside each successful Actions run. This fork currently has no macOS, Linux, iOS or app-store packages.

Windows installers are unsigned. The APK is a development-signed sideload build. Keep the same signing key when updating an installed Android app; see [development and releases](docs/fork-development.md).

## Configure Venice

1. Open Settings → Providers → Venice and enter your API key.
2. Select Fetch to discover the current chat, image generation and image editing models directly from Venice. Add the models you want to use.
3. Choose a model for your chat or open Image Creator.
4. Configure native search in the chat's search panel or in Venice settings. Choose integrated Venice chat search, Brave, Google, Exa, or X search on compatible models. Modes are Off, Automatic and Always search. Automatic Brave/Google/Exa search requires tool calling; Always search also works without tools.
5. Open Venice image settings in Image Creator for moderation, output format, size, resolution, quality, seed, steps, CFG scale and other supported options. Editing models accept reference images. Model capabilities and constraints still apply.

Venice's integrated chat search and its standalone retrieval APIs expose different options. Brave/Google/Exa choices use Venice's `/augment/search` API directly; they are not Chatbox search providers. X search takes precedence when enabled. Search and prompt enhancement can incur additional Venice charges.

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

Venice chat, search and image requests go directly to Venice; there is no fork-operated relay or backend. Prompts and selected reference files must be sent to Venice for inference. Search providers may receive queries through Venice. This implementation uses HTTPS and does not implement Venice's E2EE handshake. Models requiring that handshake are excluded.

Tracking and error reporting default to disabled. Local document parsing is the desktop default; mobile defaults to no cloud parser. You can explicitly configure other providers, MCP servers, parsers or optional upstream Chatbox services, each with its own data destination. Existing imported preferences are preserved. See [privacy and data flows](docs/fork-privacy.md).

## Development

Development, tests, Windows packaging and Android compilation can all run on GitHub. A local Android SDK, Java or signing tools are not required. See [development and releases](docs/fork-development.md) for the workflow and optional local development.

[Changelog](CHANGELOG.md) · [Upstream source and license](https://github.com/chatboxai/chatbox) · [Venice CLI reference](https://github.com/veniceai/venice-cli) · [Venice MCP reference](https://github.com/veniceai/venice-mcp-server)

Audio, video and music UI are future work. Existing Work Mode and MCP features provide an extension point; the Venice MCP server can be configured explicitly for additional modalities. It is not automatically installed or given your API key.
