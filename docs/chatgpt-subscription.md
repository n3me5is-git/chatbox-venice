# ChatGPT subscription provider

This community integration uses the ChatGPT Codex backend on desktop and Android. It does not require a local Codex installation or an OpenAI API key. Availability, model access and limits depend on the signed-in account. It never falls back automatically to API billing.

## Sign in

Open **Settings → Model providers → OpenAI Sub Unofficial**, start sign-in and copy the pairing code. Choose **Open external browser**, approve the code on `auth.openai.com/codex/device`, then return to the app. The code remains selectable and copyable while polling. A temporary network or browser-opening failure leaves it available for **Continue sign-in**. Cancel removes the pending login; disconnect removes the saved connection.

The device flow follows the official Codex device authorization exchange. Android uses the system browser through Capacitor AppLauncher. App requests use the native mobile/desktop transport to avoid embedded-browser CORS restrictions. The adapter preserves the OAuth form content type and returns pending 403/404 statuses to the polling loop. Credentials and the pending device code are stored in the local encrypted asset vault, outside provider settings and their exports. A real account sign-in and physical-device round trip still require account/device validation; synthetic UI tests do not establish account entitlement.

## Models, thinking and endpoints

**Refresh account models** fetches the catalog for the current account. A bundled snapshot of visible official Codex models provides an offline starting point, checked on 2026-11-09 against Codex 0.167.0:

- GPT-6.1 Sol and Terra; GPT-6 Astra, Sol and Luna.
- GPT-5.6 Sol, Terra and Luna; GPT-5.5.

Hidden review/experimental models are excluded. New valid account model IDs are accepted without a hard-coded allowlist. Users may also add custom text or image IDs. Refresh preserves manual entries, nicknames, context values, JSON request additions, endpoint choices and manually configured thinking levels. A model appearing in a public API list does not establish subscription access.

Text models use `/backend-api/codex/responses`. Thinking choices follow each model's catalog metadata or the levels configured in its model editor. `xhigh` and `max` remain distinct and reach `reasoning.effort`; harness-only `ultra` is not offered as a request effort.

The default image entry is **ChatGPT Images**, an intentionally version-free virtual model (`chatgpt-image-auto`). A configurable text assistant invokes the Responses `image_generation` tool without specifying its renderer version. This reflects the backend's ability to replace requested image versions.

Custom image entries offer two explicit routes:

| Route | Request |
| --- | --- |
| Image tool | `/backend-api/codex/responses`, selected text assistant plus `image_generation.model` for the custom renderer ID. |
| Images API | `/backend-api/codex/images/generations`; with reference images, `/backend-api/codex/images/edits` using JSON `images[].image_url`. |

The native Images route follows the current official Codex client contract. Neither route guarantees that a particular account accepts an ID or that a tool-backed renderer honors the requested version. Errors are shown without silently changing the model or billing route. Image 2.5/2.6 IDs can be entered manually when available to the account; the app does not label unverified version aliases as confirmed working renderers.

## Two independent web searches

**ChatGPT native web search** exposes the built-in `web_search` tool to the subscription backend. Set its provider default in provider settings and override it for a conversation in that conversation's settings. Off removes the built-in search tool from the request.

The existing Chatbox **Web search** control independently exposes the configured Chatbox search tool, including Venice if selected there. MCP/function tools remain available alongside native search. Enabling both allows the model to use either; there is no rule that native search overrides Chatbox search. Native search citations are observed from response annotations and rendered as clickable source links.

## Context and compaction

Each subscription text model starts with a configurable **300,000-token context budget** in the model editor. This is a local planning default, not a promise of the backend's actual maximum. Account-reported context metadata is retained and shown separately. The smaller declared model window still wins: a 128K model stays at most 128K; a 1M model starts with the 300K local budget until edited. The checked Codex snapshot currently declares 272K for several text models, so their effective ceiling is below the 300K planning default.

**Settings → Context & Compaction → Default context budget** defaults to **Auto (Chatbox default)**. Auto adds no numeric global ceiling: it preserves Chatbox's existing model lookup, fallback, reply reservation and compaction rules. Enter a number to add a global ceiling, or choose Auto to remove it. Click the token indicator in an existing chat to set **Session context budget** or restore inheritance. An explicit session value replaces the global value and can be higher. The resulting window is still capped by both the configured model budget and its known declared context; a budget cannot enlarge the model. Empty session value means inherit. The indicator and automatic/manual compaction use the same budget calculation.

Dedicated worker settings expose the same token override and an inherit/on/off automatic-compaction choice. Their child sessions retain those parameters; on-demand descendants inherit their immediate caller's values. Without an override they follow the global budget. Worker requests count system instructions and tool definitions, retain complete tool rounds and compact with the worker's own model. The rewrite is reused within the running tool loop while the full local transcript remains available. A later follow-up rebuilds its request from that transcript and may summarize it again. Guardian reviews enforce their budget on the complete evidence and never summarize it.

The automatic threshold is a fraction of the window **after** reserving space for the answer. The default fraction is 75%. The answer reservation is at most 32,000 tokens and at most 25% of the effective window, reduced further when a smaller reply limit is configured.

For example, a 300,000-token window with a 32,000-token reservation compacts above `(300,000 − 32,000) × 0.75 = 201,000` tokens. A 150,000-token session budget gives an 88,500-token trigger with the same reservation. The summary aims below the trigger, retaining recent messages and accounting for fixed instructions/tools; repeated compaction also requires meaningful growth. Token counts are estimates and backend limits can differ.

**Compress Conversation** in the token menu opens the existing manual compression control. It is available independently of automatic compaction when the chat has loaded context. Summarizing is a model request and can lose detail; it is not lossless archival compression. Message-count limits remain a separate existing setting.

## Sources inspected for this implementation

The 1.39 changes were checked directly against the following primary source files. These are current references, not claims that every project was a dependency or the historical basis of earlier code.

| Source | What informed this integration |
| --- | --- |
| [Official Codex models](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json) and [device authorization](https://github.com/openai/codex/blob/main/codex-rs/login/src/device_code_auth.rs) | Visible text catalog, per-model efforts and the device-code exchange. |
| [Official Codex image endpoint](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/endpoint/images.rs) and [image request types](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/images.rs) | Fixed native image generation/edit routes and JSON contracts. |
| [RayBytes/ChatMock](https://github.com/RayBytes/ChatMock) — `chatmock/model_catalog.py`, `model_registry.py`, `oauth.py` | Account catalog refresh and OAuth transport comparison. Its inspected main branch did not provide the native image generation implementation used here. |
| [OpenClaw image provider](https://github.com/openclaw/openclaw/blob/main/extensions/openai/image-generation-provider.ts) | Subscription Responses image transport, separate assistant/renderer model and image event parsing. |
| [image-use](https://github.com/leeguooooo/image-use), especially [how it works](https://github.com/leeguooooo/image-use/blob/main/docs/how-it-works.md) and the `image-use` script | Direct Codex image-tool transport, observed backend renderer rewriting and unsupported image-call reasoning parameters. Its separate browser-automation backend is not installed or used by this app. |
| [openai-api-server-via-codex](https://github.com/hotchpotch/openai-api-server-via-codex) — `internal/app/backend.go`, `compat.go`, `config.go`, `server.go` | Image-generations translation into a version-free Responses image tool. This app uses its own device-local login rather than that project's proxy or local CLI credential file. |

Official [API models](https://developers.openai.com/api/docs/models) and [image generation](https://developers.openai.com/api/docs/guides/image-generation) documents describe API capabilities; they are not used as proof of subscription access. Backend changes and account restrictions can invalidate community routes independently of app updates.

## Images and native search in Work chats

Work chats with this provider expose `chatgpt_image` when the provider has a connection and configured image models. The provider setting **Image generation in Work chats** can disable it. The tool lists exact configured image IDs/endpoints, asks for confirmation, can reference images already in this session, and stores jobs in the ordinary encrypted image generation service. Session artifacts and the library refer to the same saved output. The subscription image tool is preferred for this provider; enabled Venice tools can still be requested explicitly. A failed job requires a new user request before another generation; there is no automatic billing/provider fallback.

Native search is a separate SDK provider tool (`chatgpt_native_search`), independent of Chatbox’s client `web_search` and MCP tools. Subsequent stateless requests reconstruct native search history. Legacy orphan `ws_…` outputs are repaired without discarding valid client function-call pairs. This also applies when a later turn disables native search.

Android and desktop Work chats use the same native image tool registration. A saved text-only model list retains the virtual ChatGPT Images endpoint; an explicit image-tool disable still takes precedence. Mobile CLI capabilities identify native image tools separately from CLI image commands.
