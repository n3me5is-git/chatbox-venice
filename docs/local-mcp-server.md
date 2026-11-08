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

Workspace file/code tools also respect the chat’s workspace enable switch. Python additionally requires installation and that chat’s Python flag. Model discovery follows Venice’s selected catalog/privacy restrictions; model calls inherit chat privacy and cannot switch from a restricted Venice chat to another provider. A missing or incompatible model fails explicitly. An approval is rechecked against configuration changes before sending.

The app’s internal Venice MCP remains an in-memory transport, without an HTTP port. Existing desktop stdio and remote MCP client support is unchanged. Sharing does not install an external MCP service, expose a terminal, or enable disabled Venice modules.

## Trust and practical limits

Treat the local token as a password for the granted capabilities. A trusted external agent can read authorized decrypted content and send it elsewhere using its own tools. E2EE on the app-to-Venice connection does not control what that external client does. The HTTP endpoint is local and authenticated; it is not a LAN/cloud server or an HTTPS remote relay. Browser Origin headers and unexpected Host headers are rejected, and cookies are not authentication.

Provider credentials remain in the existing app configuration. Responses omit auth fields, redact known configured credential strings, and keep model-provider failures generic. Forwarding a separately configured MCP service is an additional trust decision; do not enable it for an untrusted client. Direct self-forwarding is excluded and recursive MCP forwarding is blocked.

Requests are bounded to 512 KiB, eight concurrent operations and a five-minute request timeout. File resources transferred over MCP are limited to 8 MiB; export larger media through the app. Code keeps its own shorter deadlines and file/memory bounds. The server does not retry paid calls automatically; external clients must also avoid retrying ambiguous paid requests. A job already accepted by Venice can continue after a local cancellation.

The tests use a real MCP SDK client against the loopback server, plus app-adapter simulations for model approvals, privacy filtering, argument validation, file scope, credential redaction and revocation. They do not send real company data or pay for media generation.
