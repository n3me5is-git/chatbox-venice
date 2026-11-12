# Desktop MCP servers

Chatbox Venice can serve trusted local MCP clients using Streamable HTTP. **Settings → MCP → App-wide MCP servers** creates independent endpoints, with separate loopback ports, random access tokens and permissions. The existing **Share this chat through MCP** remains a separate, narrower endpoint. Nothing starts automatically after installation or restart. Up to eight listeners can run together.

An existing single-chat endpoint exposes the selected workspace, saved generations, explicitly supplied text-model requests and optionally its agents. It does **not** provide a conversation send/read tool. The app-wide endpoint adds an explicit conversation grant for that purpose.

## Access profiles

| Profile | Data and operations |
| --- | --- |
| Models and Studio only | Acts as a local router. Configured LLMs, optional external function schemas, direct Venice Studio pipelines and input/output transfer in an internal temporary workspace. Cannot browse existing chats, run workers, execute scripts, search or forward other MCP services. |
| Shadow workspaces only | Can create and manage only this endpoint’s temporary workspaces, with the individually granted tools and agents. Cannot retain a temporary workspace as a normal chat or access existing chats. |
| Authorized app access | Can discover unlocked root chats and use granted features. Creating, configuring/deleting chats and reading/sending conversation messages have separate controls. Cannot read another endpoint’s temporary workspace or bypass protected content. |

All profiles separately control file reading, uploads/writes, LLM calls, automatic LLM approval, Studio, and automatic Studio approval. Full/shadow profiles can additionally grant isolated code execution, search, forwarded MCP services and multi-agent operation. Dedicated agents must be selected for the endpoint; their own guardian policies and nested permissions still apply. A sandbox ID never authorizes raw access to a worker: use reviewed agent tools.

**Auto** preserves app/model privacy choices, including strongest supported automatic Venice transport. **Require E2EE** filters text calls to E2EE Venice models and fails if encryption or verification fails. **Require TEE or E2EE** permits attested Venice models, using E2EE for capable models. These requirements never fall back to ordinary models. Studio images/audio/video use separate Venice APIs and are not made E2EE by this switch.

An external MCP client receives decrypted results on this computer. The model connection can still be E2EE: Chatbox encrypts before sending to Venice and verifies/decrypts the response locally. Optional external function schemas are definitions only: app_model returns proposed calls without executing them. The external orchestrator executes its tools and supplies explicit tool results in its next request. With encrypted-text E2EE transport these definitions, arguments and results use the existing encrypted tool protocol; native non-E2EE providers have their normal visibility.

## Client setup

Copy a running endpoint’s configuration into a Streamable HTTP MCP client that supports an Authorization header:

```json
{"mcpServers":{"chatbox-router":{"url":"http://127.0.0.1:YOUR_PORT/mcp","headers":{"Authorization":"Bearer YOUR_LOCAL_TOKEN"}}}}
```

This is an MCP endpoint, not an OpenAI-compatible HTTP API server. Each port accepts only its own token. Stopping one endpoint leaves the others running. **Stop all MCP endpoints**, app lock, protection changes, window destruction or quitting revoke access. A new run gets a new token. There is no LAN bind or public pairing relay.

## Application tools

- **app_contexts**: list/get authorized root workspaces; create, configure or permanently delete them when granted. Creation uses request_id. New workspaces inherit no conversation, global system prompt, knowledge collection or OS directory. Use settings for the chosen provider/model, context/token parameters and permitted multi-agent policy. System-prompt changes additionally require conversation permission.
- **app_context_tools**: discover actual tool schemas for a context. **app_call** executes one of these tools after argument and capability validation. This includes the reviewed agent lifecycle/file-transfer tools.
- **app_conversation**: explicit read or send. Sending uses saved conversation context and only endpoint-granted tools, with ordinary configured model transport. It refuses busy chats and incomplete bounded history rather than silently dropping earlier instructions. Compact long conversations in the app first. This API is a bounded MCP conversation runner; it does not emulate every UI command.
- **app_models / app_model**: router text-model discovery and one model turn, without implicit chat history. Returns contentParts (including proposed tool calls), text, usage and available local verification evidence. Provide tools only when external function schemas were granted. Definitions use {name, description, inputSchema}; assistant toolCalls use {toolCallId, toolName, input}; tool messages use {role: "tool", toolCallId, toolName, result}.
- **venice_studio**: direct catalog/pricing, generation, quotes, status, bounded wait, pause/resume, remote queue cleanup, transcription, voice conversion and supported voice cloning. Image generation accepts referencePaths; video references map API reference parameter names to uploaded workspace paths. Choose exact catalog IDs and supported options. Cloned-voice listings are confined to handles created in that temporary context.
- **app_upload**: sequential binary chunks of at most 256 KiB, encrypted in app storage. Keep uploadId (UUID), path, mime, totalBytes and full-file sha256 constant; index starts at zero; set final on the last chunk. Changed retries and final hash mismatches are rejected. Media can use the existing 128 MiB workspace limit; individual Studio input APIs impose their own smaller limits.
- **app_resources**: list saved resources or retrieve ranges up to 256 KiB. The response includes base64, version, offsets, total length, full-file SHA-256 and chunk SHA-256. Carry version across chunks and verify the assembled hash. Encrypted media is streamed through a bounded buffer instead of loading the entire library.
- **app_cleanup**: permanently remove the endpoint’s selected temporary workspace (or all of its temporary workspaces), generated records, files, upload staging and descendant agent sandboxes after retrieval. It never removes an existing personal chat or another endpoint’s space.

Router tools use an internal workspace without a sessionId. Full/shadow operations require an authorized sessionId from app_contexts. Router mode also retains the existing venice_image/venice_media adapters where enabled; venice_studio exposes the direct Studio paths without requiring the chat-tool toggle.

## Retry and shadow lifecycle

Use stable request_id values for paid or destructive operations. Identical retries within the same endpoint run share the original outcome; changing inputs under the same ID is rejected. Failed or ambiguous calls are not replayed automatically. Large results are retrieved from saved resources rather than retained indefinitely in the retry cache. After restart, a new token has no authority to replay old requests.

Temporary output stays hidden from ordinary chat lists, Studio history and the media library. Download all resource chunks before app_cleanup; merely reading a result does not delete it. Endpoint stop also attempts cleanup. If storage is locked/unavailable or Venice cannot confirm queue cleanup, the temporary manifest remains for retry after unlock/startup or **Clean up stopped endpoints**. A force quit cannot guarantee immediate deletion while the app is stopped.

Queue cleanup uses the original Venice endpoint/key and its existing completion API. Local cleanup does not promise secure erasure from SSD backups or deletion unsupported by the provider. In particular, cloned voices currently expire according to Venice retention; removing their local handles is not immediate remote voice deletion. No automatic retry starts another paid generation.

Provider credentials never enter client configuration, model discovery or normal tool responses. The existing credential-redaction layer also covers app-wide results. Resource access still checks app/project locks, workspace switches, relative paths and granted capabilities. Browser Origin headers and unexpected Host headers remain rejected. HTTP requests are limited to 512 KiB, eight operations per endpoint, five minutes per request and bounded responses.

---

## Existing single-chat sharing details

The desktop app can act as an opt-in MCP server. Open **Files and resources → Workspace settings → Share this chat through MCP**, or Settings → MCP while that chat is selected. Choose the permissions, then start sharing. It never starts automatically after installation or restart.

The server binds only to `127.0.0.1`. Copy the client configuration into a trusted local MCP application supporting **Streamable HTTP** and an Authorization header. The copied configuration contains a local access token; it does not contain provider API keys. A typical configuration shape is:

```json
{
  "mcpServers": {
    "chatbox-venice": {
      "url": "http://127.0.0.1:YOUR_PORT/mcp",
      "headers": { "Authorization": "Bearer YOUR_LOCAL_TOKEN" }
    }
  }
}
```

Use the actual copied values and your client’s configuration format. Port `0` selects a free port; an explicit unprivileged port is useful for a fixed client setup. Every new sharing run creates a new token. **Stop sharing** revokes it and cancels pending requests. Quitting the app, destroying its main window, locking it, or changing content protection also stops sharing. A hidden/tray app can remain active if its background-lock setting allows it. The Android app does not start a persistent local HTTP server.

## Permissions

Only file reading is selected initially. Grant each additional capability deliberately:

| Permission | What the external client receives |
| --- | --- |
| Read files/media | This chat’s resource list and bounded file content through MCP tools/resources. No automatic chat transcript export. |
| Write files | Create, change, import, deliver and permanently delete managed session files. |
| Execute code | The same isolated `session_js` and optional `session_python` runtimes used in the app. Requires file read/write access. |
| Text models | `app_models` and `app_model`, using configured text models and explicit messages. No implicit chat history or recursive model tool calls. |
| Automatic model calls | Explicitly allows text model charges without a new app dialog for each call. Off by default. |
| Venice Studio | Existing `venice_image` and `venice_media` tools, including their current chat approval policy and enabled media modules. |
| Web search | The configured Chatbox search/link tools, using their existing provider configuration. |
| Other MCP services | Tools from enabled MCP clients, including desktop stdio services. These services retain their own authority and may access data outside the shared chat. |
| Multi-agent | Opt-in `agent_catalog`, `agent_tree` and the same spawn/status/message/wait/result/file/stop tools used in Work chats. Authorizes model charges for workers and their configured guardians. Off by default and independent of direct `app_model` approval. |

Workspace file/code tools also respect the chat’s workspace enable switch. Python additionally requires installation and that chat’s Python flag. Model discovery follows Venice’s selected catalog/privacy restrictions; model calls inherit chat privacy and cannot switch from a restricted Venice chat to another provider. A missing or incompatible model fails explicitly. An approval is rechecked against configuration changes before sending.

The app’s internal Venice MCP remains an in-memory transport, without an HTTP port. Existing desktop stdio and remote MCP client support is unchanged. Sharing does not install an external MCP service, expose a terminal, or enable disabled Venice modules.

## Delegate through the multi-agent group

First enable **multi-agent mode in the shared Work chat**, select the dedicated agents and nested-agent permissions there, then select **Run and manage this Work chat’s agents** in the local MCP sharing permissions. This does not let an external client change the agent library, model configuration, guardians, nested permissions or maximum depth of three. `agent_catalog` lists only the permitted dedicated profiles, their inherited tool names and guardian presence; system prompts are not returned.

`agent_tree` shows the complete tree for that chat, including nested run IDs, status, model, parent and sandbox IDs. It returns metadata only. `agent_spawn` creates a direct worker and returns immediately. Use `agent_wait` to wait at most 45 seconds, `agent_status` for a snapshot, and `agent_result` for a guardian-reviewed summary. `agent_files` lists bounded file metadata from a direct child sandbox after guardian review and requires the file read grant; use `agent_file` to copy chosen files through a separate review of the actual bytes. `agent_message` sends an explicit follow-up to an idle direct worker. `agent_stop` cancels that worker and its descendants. Controls are limited to direct workers created by the current sharing grant. Nested workers remain under their own caller; seeing a sandbox ID does not grant raw file or transcript access.

Dedicated workers receive an isolated sandbox and explicitly supplied task context. On-demand workers share the root file workspace and selected model. Workers and nested workers inherit the intersection of the chat’s policy, the dedicated agent’s configuration and **the features shared through MCP**. In particular, read-only sharing stays read-only inside workers; delegation cannot turn on code execution, web search, Venice Studio or forwarded MCP services. `agent_file` additionally requires both file read and write grants and reviews the exact immutable bytes through the applicable guardians before copying. No overwrite is allowed.

Generated media remains associated with the child chat that created it. `agent_files` distinguishes shared workspace `files` from that child’s `resources`; it returns at most 50 entries by default (configurable up to 100) and a `nextOffset` for pagination. To retrieve a generated result from an on-demand child, call `agent_file` with `direction: "from-agent"`, `sourceArea: "resources"`, its listed `sourcePath`, and a new `targetPath` in the caller’s workspace. This copies the existing local bytes after review; it does not regenerate or download another paid result. Ordinary shared workspace files require no transfer.

A guardian refusal is returned to the external calling agent as `{ "blocked": true, "error": "…" }`, without the blocked result or file payload. The app also records the refusal. Do not retry by renaming, encoding or routing the same material through another worker. A guardian is a model-based check, not a proof that data is anonymous.

Starting app-managed agents and MCP-managed agents concurrently in the same root workspace is disallowed. Finish existing app workers before starting delegation through MCP; stop MCP sharing before returning control to the app orchestrator. Stopping sharing, locking, quitting, or revoking the grant cancels its workers and descendants; an in-flight provider request may already have incurred a charge. A new token cannot resume workers from an older grant. Changing the root model or multi-agent configuration requires restarting sharing. Saved files and completed runs remain in the chat.

## Trust and practical limits

Treat the local token as a password for the granted capabilities. A trusted external agent can read authorized decrypted content and send it elsewhere using its own tools. E2EE on the app-to-Venice connection does not control what that external client does. The HTTP endpoint is local and authenticated; it is not a LAN/cloud server or an HTTPS remote relay. Browser Origin headers and unexpected Host headers are rejected, and cookies are not authentication.

Provider credentials remain in the existing app configuration. Responses omit auth fields, redact known configured credential strings, and keep model-provider failures generic. Forwarding a separately configured MCP service is an additional trust decision; do not enable it for an untrusted client. Direct self-forwarding is excluded and recursive MCP forwarding is blocked.

Requests are bounded to 512 KiB, eight concurrent operations and a five-minute request timeout. File resources transferred over MCP are limited to 8 MiB; export larger media through the app. Code keeps its own shorter deadlines and file/memory bounds. The server does not retry paid calls automatically; external clients must also avoid retrying ambiguous paid requests. A job already accepted by Venice can continue after a local cancellation.

The tests use a real MCP SDK client against the loopback server, plus app-adapter simulations for model approvals, privacy filtering, argument validation, file scope, credential redaction and revocation. They do not send real company data or pay for media generation.
