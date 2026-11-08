# Chatbox Venice

A local-first fork of [Chatbox Community Edition](https://github.com/chatboxai/chatbox), focused on Venice and configurable vendor APIs. GPL-3.0.

[Downloads and release notes](https://github.com/n3me5is-git/chatbox-venice/releases) · [Builds and logs](https://github.com/n3me5is-git/chatbox-venice/actions) · [Italiano](README.it.md)

## Downloads

The fork builds a Windows x64 setup and an Android APK. Download them from this repository's [latest release](https://github.com/n3me5is-git/chatbox-venice/releases/latest). Builds awaiting publication are available as artifacts inside each successful Actions run. This fork currently has no macOS, Linux, iOS or app-store packages.

Windows installers are unsigned. New versions use a release-mode APK signed for personal sideload installation. Keep the same signing key when updating an installed Android app; see [development and releases](docs/fork-development.md).

## Session files and local agent tools

Open **Files and resources** in a chat header: desktop uses the right sidebar, mobile a scrollable sheet. Browse attachments, generated media, existing artifacts and managed files in one tree. Markdown previews render LaTeX, Mermaid, tables, a table of contents, local images and relative links. Edit, export or delete individual files. Working scripts stay out of the library; mark a final document as a deliverable to include it.

Managed files and their index use authenticated encrypted local storage and have a dedicated encrypted backup/restore flow. Agent mode can manage those files and run isolated JavaScript; optional Python downloads a verified local runtime and selected packages, then executes offline. These runtimes receive only selected files, with no operating-system shell, provider keys or app-data access. Existing Work tools keep their behavior. See [session workspace guide](docs/session-workspaces.md).

On desktop, optionally share the selected chat with a trusted external agent through an authenticated, loopback-only **MCP server**. File access, isolated execution, text-model calls, Venice Studio, search and forwarding other MCP tools have separate permissions. Text-model calls ask for approval unless you explicitly allow automatic calls. Sharing stops on lock or app exit. See [MCP client setup and trust boundaries](docs/local-mcp-server.md).

Markdown previews also offer **Export PDF** and **Export single-file HTML**, including embedded images, diagrams and math fonts. Text attachments can be edited as managed copies. Configure independent recognition/synthesis models in **Settings → Default models**, then use the chat microphone or **Read aloud** under a reply. Dictation appends editable draft text without sending it. Private chats refuse non-private/unknown speech; E2EE chats ask for consent on every private speech request because the audio endpoints use HTTPS, not text E2EE. See [export and speech setup](docs/markdown-export-and-speech.md).

## Collaborative chats

Use the people icon in a saved chat to share it, or **Collaborative chats** in the sidebar to join by QR/code. The owner admits participant IDs and grants write, AI/tools and clone permissions. Agent questions and Venice approvals can go to the owner, everyone (first valid answer), or only the requester. Traffic between devices is encrypted; files transfer on demand, and sharing stops on lock/exit. Individually protected creations are excluded from public-chat shares. See [collaboration, privacy and limits](docs/collaboration.md).

Venice model menus now show available costs and units. Live classifications replace obsolete saved types, including image entries such as Krea 2 Turbo. Generation failures show the provider's reason directly. See the [405-entry catalog audit](docs/venice-catalog-audit-2026-11-08.md).

## Configure Venice

For separate **global Chatbox search** tools, open **Settings → Web Search → Venice** and enable **Expose separate search engines**. This offers `web_search_brave`, `web_search_google` and `web_search_exa`, independently of the Venice model/profile search controls.

1. Open Settings → Providers → Venice and enter your API key.
2. Select Fetch to discover the current chat, image generation and image editing models directly from Venice. Add the models you want to use.
3. Choose a model for your chat or open Image Creator.
4. Configure native search in the chat's search panel or in Venice settings. Choose integrated Venice chat search, Brave, Google, Exa, or X search on compatible models. Modes are Off, Automatic and Always search. Automatic Brave/Google/Exa search requires tool calling; Always search also works without tools.
5. Open Venice image settings in Image Creator for moderation, output format, size, resolution, quality, seed, steps, CFG scale and other supported options. Editing models accept reference images. Model capabilities and constraints still apply.

Venice's integrated chat search and its standalone retrieval APIs expose different options. Brave/Google/Exa choices use Venice's `/augment/search` API directly. Separately, Settings → Web Search → Venice configures the Chatbox retrieval tool and its backend. The two sets of controls are independent. The Venice row has its own pause switch and settings icon; optionally expose separate Brave, Google and Exa tools. X search takes precedence when enabled. Search and prompt enhancement can incur additional Venice charges. See [search controls and encrypted tool calling](docs/search-and-encrypted-tools.md).

## Library and mobile controls

Open **Local media library** in the sidebar for categorized thumbnails, previews and public/protected files. Upload offers Device or Local library from a single control. Image prompts insert a newline on Enter; the explicit button starts generation. Advanced image settings open separately so the result remains visible. Protected previews ask for authentication. Image history offers creation actions and long press; Studio history follows the current media category.

Find **Hide Chatbox AI in selectors** in Settings → Providers or Appearance. Venice approval policy is in conversation settings. Model lists can be filtered by type and privacy, with catalog badges inside the options. All registered fork UI strings have English and Italian resources; other supported locales use English fallback.

## Optional media and chat tools

Enable Audio/transcription, Video or Music/SFX in Settings → Providers → Venice. Open **Venice Studio** in the sidebar. Load the current catalog explicitly and choose models by name. Speech shows model-specific voices, compatible formats, language and speed; a short voice test runs only on an explicit click and may have a cost. Enter text or choose a transcription file. Cached catalog metadata can be reused locally. Technical IDs and JSON are under Advanced options. Model cards show supported options and documentation. Music/video controls follow the selected model; transcription can also record the microphone locally. Supported model options can be supplied as extra JSON. The app never automatically creates a paid job again after an error.

Video and music save their queue IDs locally. Resume retrieves the existing job after an interruption or app restart. Once downloaded and saved, the app requests remote cleanup; failures remain visible and can be retried. You can export media, remove the local entry or explicitly clean up the remote copy. Closing the app or stopping polling does not guarantee server cancellation or a refund. Files are limited to 25 MB for transcription and 128 MB for generated media.

The **Venice internal MCP** is available when Venice is configured and enabled; its switch is in Settings → MCP or the Venice provider. Use it to let Venice chat models discover, quote, generate and manage this chat's media. Venice approvals beside the chat balance select Ask every time, Remember similar generations after approval, or Automatically approve generations. Policies and image parameter defaults apply only to that chat until the app closes. Similar requests match tool, model and parameters while allowing a new prompt. Reset revokes them immediately. Unknown/ambiguous image models and required reference uploads still need human input; deletion always asks. Tools return metadata, not media blobs or API credentials. Existing local tools, MCP integrations and other providers retain their behavior. Media prompts and selected files go directly to Venice, without E2EE.

Save reusable search/image profiles in Venice provider settings, then select or override them per model or existing chat. Priority is provider → saved profile → model → chat → extra model request JSON. Permission switches remain provider-level. Turning Venice off blocks new Venice requests while preserving local history.

English is the source language for fork releases and UI. Fork controls use the existing translation resources and live language switching; missing new translations fall back to English. Core approval controls cover all 15 supported desktop locales. See [testing and localization](docs/fork-testing.md).

## Protected local storage and model privacy

Open **Settings → Data & Backup** to configure independent PIN/passphrase and biometric/device unlock, app-open/background locking, project locks, encrypted library backup/restore and cleanup. Image Creator and Studio have public/protected histories and a protection switch for new outputs. Native media is encrypted on disk and opened lazily; public library means no extra PIN. A project's lock guards access inside the app and does not encrypt the existing ordinary conversation database or external files. See [local protection and backup boundaries](docs/local-security.md).

Venice settings offer **Privacy Only**, optional TEE verification/text E2EE and **Show other models from Venice**. E2EE tools require explicit opt-in: encrypted tool messages keep definitions, calls and textual results inside the encrypted conversation; an alternative native mode exposes tool metadata with a warning and requires catalog support. Client search/MCP tools remain available after consent. Provider-integrated search and multimodal input remain unavailable in E2EE text mode. Attestation validates nonce/model/key bindings and signed replies; Intel/NVIDIA certificate verification relies on Venice's reported verdicts. Catalog badges show provider privacy/uncensored claims. See [transport and execution boundaries](docs/search-and-encrypted-tools.md).

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
