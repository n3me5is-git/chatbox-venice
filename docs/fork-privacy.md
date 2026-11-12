# Privacy and data flows

This fork stores chats, provider configuration and generation history locally using the existing Chatbox storage adapters. It does not operate a hosted relay or synchronization service.

## Venice

- Authentication uses the API key you enter locally. The build workflow never receives it.
- Chat prompts, selected attachments, search queries and image prompts are sent directly to the configured Venice API endpoint over HTTPS.
- Selecting Brave, Google or Exa calls Venice's retrieval API. Venice routes the query to that search service. X search is model-dependent.
- Secure text chat can require TEE verification or E2EE on compatible catalog models. E2EE encrypts text history on-device, checks encrypted replies and requires a response signature. Strict verification binds the exact encrypted request; optional **Compatible gateway receipts** instead verifies the attested signer while trusting gateway-reported payload hashes, with an explicit warning and off by default. See [the investigation and verification limits](venice-secure-receipts.md). Tools are off until explicit consent: encrypted tool messages carry definitions/calls/text results inside ciphertext; optional native tools expose current tool metadata and require catalog support plus the selected receipt-verification policy. Strict mode requires signatures binding the actual call. Client search/MCP can operate after consent; executing services receive their required arguments. Attachments and provider-integrated search remain unavailable in E2EE text mode. Verification failures do not retry in plaintext. Hardware root-chain verification relies on Venice's reported Intel/NVIDIA verdicts; this app checks the fresh nonce, model, quote fields, debug rejection and key bindings, but does not independently validate model hardware root chains. For NEAR streaming response signatures, it separately obtains a fresh public gateway quote and validates that CPU quote locally against Intel roots, using public Phala certificate collateral. No Venice key, prompt or media is sent to those metadata services; software measurements are not allowlisted. TEE alone leaves the prompt readable to Venice. Media APIs do not support this text handshake. See [encrypted tool transports and search](search-and-encrypted-tools.md).
- Native image generation returns base64 or binary data directly to local history. Prompt EXIF metadata defaults off. Prompt enhancement is opt-in.
- Local tools run within the existing host and approval mechanisms. Data returned by tools can become part of the model conversation and be sent to its selected provider.

## Optional audio, video and music

Audio/video/music modules are off until explicitly enabled. From 1.26.0 the internal Venice MCP is available by default when the provider has a key and is enabled, only to Venice models in Work Mode; it has its own switch in MCP and provider settings. It cannot enable disabled media modules. Image generation follows the current chat’s ask/similar/automatic approval policy; unresolved model/reference choices require human input. Studio media history opens locally; its media catalog loads on request. Provider/model and image selectors can refresh the authenticated model catalog, and visible Venice credit widgets request `/billing/balance`. Neither request generates content or incurs an inference request. Loading models, quoting, generation, polling and cleanup contact the configured Venice endpoint directly. Transcription uploads the selected file. Speech/video/music prompts and additional parameters are sent to Venice without E2EE. No background paid re-creation happens on startup or failure.

Queue IDs, model IDs, prompts, status and media are stored locally. A SHA-256 credential fingerprint binds resumable jobs to the original endpoint/key; media records do not duplicate the API key. New native media uses encrypted chunk storage, with separate public/protected library areas and portable encrypted media backup. Protected Studio/image metadata is encrypted too. Ordinary chat/settings databases retain their inherited format. See [local storage, app/project protection and backup boundaries](local-security.md).

After video/music bytes are saved successfully, the app requests remote completion/cleanup. A failure leaves the local result and a retry control. Deleting a local record does not implicitly contact Venice. A remote cleanup confirmation represents Venice's response; the client cannot independently verify provider retention. Stopping polling or closing the app does not necessarily cancel a running server job.

Media tools are registered only for Venice models in Work Mode when enabled. List/status/resume/delete are limited to records created for the current chat. The default chat policy asks before paid generation. A human can explicitly remember similar tool/model/parameter requests or enable automatic generation for this chat; prompts may change and charges can follow. Policies/grants and image parameter defaults live only in memory, are isolated by chat and are not part of backups. Reset or a relevant configuration change revokes them. No prompt or uploaded reference is kept in the approval defaults. Destructive tool actions always require approval. Local filesystem tools retain the existing permissions and approvals; their results may be sent to the selected chat model.

The internal MCP uses a client/server pair connected by an in-memory transport inside the app. It does not start a process, open a port or send tool messages to a separate MCP host. API calls still contact Venice directly. Image tool records and status are limited to the current chat; user-selected references and per-call parameters are saved with the image generation. Model names are matched against the available catalog; ambiguity requires user selection.

Microphone recordings stay local until submitted. Tracks are stopped after recording or leaving the component; recordings can be converted to WAV locally for compatible models. Cloning uploads selected audio only after duration/format checks and confirmation. Supported clone handles follow Venice's documented seven-day retention; removing a handle is local, with no immediate remote sample deletion endpoint implemented. Voice conversion uses the dedicated voice-changer API. Model documentation opens only on user action and can load website resources independently of the API.

Venice embeddings send the indexed text to Venice. The app keeps the knowledge-base documents and vector index locally using the existing RAG implementation. Privacy/uncensored icons reproduce provider metadata; they are not a verification of retention or encryption.

## Delete generated content

Delete an entry in Image Creator history to cancel any active request, delete the local record, and clean up generated/reference images that are no longer used by another record. Exported copies and user-created backups must be deleted separately from their saved locations. Local deletion is not a remote deletion request to Venice or a search provider.

## Session files, optional execution and local MCP

Managed session files and metadata are encrypted locally and opened lazily. Existing Work folders keep their original storage. Preview rendering, Mermaid, file search, JavaScript and installed Python execute locally. Remote Markdown images require explicit consent; external links open only on user action. Optional Python installation downloads pinned hash-verified runtime/packages from jsDelivr without prompts, files or API keys; execution itself blocks network access.

An enabled model can request workspace operations only through the exposed tools and current chat controls. Tool results can enter that model's conversation, under its selected transport privacy. Selected code inputs are copied into an isolated runtime; the interpreter does not see the app's provider credentials or full session database.

The opt-in desktop MCP server accepts authenticated loopback clients through independently permissioned single-chat or app-wide endpoints. App-wide profiles can restrict a client to its own temporary shadow workspaces or to local LLM/Studio routing. It does not start automatically or replace the internal Venice MCP. An external client can receive authorized decrypted files/model results and independently transmit them; use only trusted clients. Text-model calls require approval unless explicitly granted automatic calls. Existing Venice paid-generation approvals still apply. Stopping an endpoint revokes its token; lock/app exit revokes all endpoints. See [MCP setup](local-mcp-server.md) and [workspace guide](session-workspaces.md).

## Markdown export and on-demand speech

Markdown HTML/PDF conversion runs on the device, with embedded preview assets and offline native print renderers. Previously opted-in remote preview images may be fetched to embed them; export does not automatically enable remote images. Saved copies are readable external files and must be protected/deleted separately.

The microphone retains a local recording until the explicit transcription action. Global ASR receives that recording; its text is added to a draft without sending the chat. Reply reading sends readable text from the chosen reply to global TTS, not the full history. Private chats block non-private/unknown speech. E2EE chats require explicit per-request consent for private speech over HTTPS; no audio E2EE is claimed. Audio stays transient, playback stops on close/lock/background, and failed paid calls are not retried automatically. See [speech configuration and boundaries](markdown-export-and-speech.md).

## Other inherited features

Tracking and error reporting default off for new settings. Imported or previously saved choices remain as selected. Desktop document parsing defaults to local; mobile defaults to no automatic cloud parser. Optional Chatbox services, third-party providers, MCP servers and cloud parsers have their own data flows and require configuration. Public model catalogs or optional service metadata may still be requested by inherited app features. A local-first app is not necessarily offline.

Auxiliary summary generation respects the selected local model settings; remote configuration cannot silently choose another provider for a summary. Explicitly choosing a separate fast model authorizes its use for auxiliary tasks.

Update checks contact this fork's public GitHub release feed without sending an installation identifier. Release downloads are served by GitHub. Check the policies of Venice, any search service you select, GitHub, and any other service you explicitly configure.
