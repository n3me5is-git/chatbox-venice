# Share a chat with a local MCP client

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

A guardian refusal is returned to the external calling agent as `{ "blocked": true, "error": "…" }`, without the blocked result or file payload. The app also records the refusal. Do not retry by renaming, encoding or routing the same material through another worker. A guardian is a model-based check, not a proof that data is anonymous.

Starting app-managed agents and MCP-managed agents concurrently in the same root workspace is disallowed. Finish existing app workers before starting delegation through MCP; stop MCP sharing before returning control to the app orchestrator. Stopping sharing, locking, quitting, or revoking the grant cancels its workers and descendants; an in-flight provider request may already have incurred a charge. A new token cannot resume workers from an older grant. Changing the root model or multi-agent configuration requires restarting sharing. Saved files and completed runs remain in the chat.

## Trust and practical limits

Treat the local token as a password for the granted capabilities. A trusted external agent can read authorized decrypted content and send it elsewhere using its own tools. E2EE on the app-to-Venice connection does not control what that external client does. The HTTP endpoint is local and authenticated; it is not a LAN/cloud server or an HTTPS remote relay. Browser Origin headers and unexpected Host headers are rejected, and cookies are not authentication.

Provider credentials remain in the existing app configuration. Responses omit auth fields, redact known configured credential strings, and keep model-provider failures generic. Forwarding a separately configured MCP service is an additional trust decision; do not enable it for an untrusted client. Direct self-forwarding is excluded and recursive MCP forwarding is blocked.

Requests are bounded to 512 KiB, eight concurrent operations and a five-minute request timeout. File resources transferred over MCP are limited to 8 MiB; export larger media through the app. Code keeps its own shorter deadlines and file/memory bounds. The server does not retry paid calls automatically; external clients must also avoid retrying ambiguous paid requests. A job already accepted by Venice can continue after a local cancellation.

The tests use a real MCP SDK client against the loopback server, plus app-adapter simulations for model approvals, privacy filtering, argument validation, file scope, credential redaction and revocation. They do not send real company data or pay for media generation.
