# Search and encrypted tool calling

## Two independent search controls

**Chatbox web search** exposes `web_search`. Configure its provider in **Settings → Web Search**. When that provider is Venice, retrieval calls `POST /api/v1/augment/search` directly with the selected Brave, Google or Exa backend. Retrieval does not invoke a chat model. The chat model receives the results in a subsequent completion. The chat's global search switch controls this tool.

**Venice model search** has a separate row and settings icon in the chat tools panel. Its switch pauses/resumes search for that chat without erasing the configured mode, engine or citation settings. **Do not search** greys out the switch. The same settings can be inherited from the provider, a saved profile or the selected model, then overridden for the chat. New-chat choices carry into the created conversation.

The modes are:

- **Do not search:** no Venice search, X search or scraping augmentation.
- **When needed:** integrated Venice search lets the provider decide; a selected external engine is exposed as a client tool and requires tool use.
- **For every message:** a selected external engine runs an initial retrieval before the completion. A compatible model can request follow-up searches. Integrated Venice search uses the provider's native option.

X search takes precedence over the selected engine when enabled. Citations and scraping apply according to the selected API path; they are not settings for the independent global Chatbox tool.

Enable **Expose separate search engines** in Venice provider settings, or choose **Separate Brave, Google and Exa tools** in a model/chat profile, to expose:

| Tool | Retrieval backend |
| --- | --- |
| `venice_web_search_brave` | Brave |
| `venice_web_search_google` | Google |
| `venice_web_search_exa` | Exa |

The default remains one `venice_web_search` tool using the selected engine. Separate mode replaces that tool and disables provider-integrated web augmentation. In **For every message**, the selected external backend supplies the initial retrieval; if the selection was integrated Venice search, Brave supplies it instead. The UI explains this fallback. X search still takes precedence.

Both control rows can be enabled together. No tool replaces the other: `web_search` uses the global provider, while the Venice names use Venice retrieval. Ask explicitly for a tool by name when needed; a model still must follow the instruction. Integrated provider search is not a separately selectable client tool.

Turning off a switch prevents subsequent tool dispatches in the current chat and removes that search family from later steps. It cannot retract an HTTP request already sent. Use Stop to abort the current answer. Search failures disable that tool for the answer. Identical normalized queries reuse their previous result and remove the repeatedly requested tool. Global and Venice search share a maximum of six tool network executions per answer, in addition to an optional initial **For every message** retrieval. Default completion limits are 12 steps for a search answer or 32 in Work Mode; an explicitly supplied existing step limit is preserved.

## Optional tools in E2EE text chat

Open **Settings → Providers → Venice**, select E2EE text privacy, then enable **Tools in encrypted chat**. Existing installations keep tools disabled until consent is given. Normal Work Mode, MCP permissions and generation approvals still apply. The transport choice is provider-level and cannot be granted by a model profile, chat override or tool output.

### Encrypted tool messages

This is the default choice after opt-in. Tool definitions, invocation arguments and textual results are rendered into the text conversation before encryption. The app decrypts and verifies the enclave response signature, parses allowed tool calls, validates their schemas through the existing SDK, and dispatches them through the existing tool/approval pipeline. Results are encrypted with the conversation on the next turn. No native `tools` metadata is sent in this mode.

This uses the tool-text protocol from [elkimek/venice-e2ee](https://github.com/elkimek/venice-e2ee#function-calling), pinned to commit [`d8e37d15c1fef198eabc64a4d203939595aa9179`](https://github.com/elkimek/venice-e2ee/tree/d8e37d15c1fef198eabc64a4d203939595aa9179). Only its `src/tools.ts` module is vendored as `tool-text-protocol.ts`, with attribution and the [upstream GPL-3.0 license](third-party/venice-e2ee-tools-LICENSE.txt). This is a client text protocol: actual model reliability depends on following its instructions, rather than the catalog's native function-calling flag. Malformed or unknown calls fail validation; there is no automatic downgrade to plaintext tools.

### Native tools with visible metadata

This optional compatibility mode follows the [Venice guide](https://docs.venice.ai/guides/features/tee-e2ee-models): the model must explicitly advertise `supportsFunctionCalling`. Text prompts and replies remain encrypted, but tool definitions and the current native call/result exchange are outside E2EE and may be visible to Venice. Older tool history is folded back into the encrypted conversation.

By default, the app requires the response signature to bind the actual native function-call data. A signature covering only empty/text content cannot authorize tool execution. An unsupported gateway/signature format fails closed and suggests choosing encrypted tool messages; the app does not retry automatically with a different privacy mode. An explicitly enabled **Compatible gateway receipts** setting instead checks the attested signature and consistent receipt identifiers/hashes without proving independent payload binding. That limitation also covers native tool arguments. See [the live investigation and policy](venice-secure-receipts.md). Neither path is certified against every Venice model/gateway.

### Execution boundaries

The encrypted text protocol protects the conversation between the app and the model enclave. A search service, local tool or external MCP server still receives the arguments needed to execute its operation. Search results are re-encrypted on the way back to the model. The consent dialog explains this boundary. Only enable tools and MCP services you trust.

Venice provider-integrated search and multimodal input remain unavailable in the E2EE text transport. Use the independent Chatbox tool or the Venice Brave/Google/Exa client tools for search. Binary tool results remain local; a textual marker/metadata is sent to the text model. Image, audio, video and other media APIs use their normal HTTPS transport, including when invoked by an encrypted chat. TEE-only mode is distinct from E2EE. Existing attestation verification limits are described in [provider privacy](fork-privacy.md).

## Verification

Focused CI tests exercise the real SDK with synthetic API/enclave responses: encrypted tool selection and result return, native metadata opt-in, signature tampering, insufficient signature coverage, native capability gating, all three search backends, failed/duplicate search limits, independent revocation and the global `web_search` completion cycle. React and mobile Chromium tests exercise consent, cancel, dropdown persistence and both search switches. No paid inference or production API key is used in CI. Separately authorized live tests now cover E2EE text and a complete encrypted-text tool/result cycle; see [secure receipts](venice-secure-receipts.md). See [test workflows and device limits](fork-testing.md).
