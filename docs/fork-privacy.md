# Privacy and data flows

This fork stores chats, provider configuration and generation history locally using the existing Chatbox storage adapters. It does not operate a hosted relay or synchronization service.

## Venice

- Authentication uses the API key you enter locally. The build workflow never receives it.
- Chat prompts, selected attachments, search queries and image prompts are sent directly to the configured Venice API endpoint over HTTPS.
- Selecting Brave, Google or Exa calls Venice's retrieval API. Venice routes the query to that search service. X search is model-dependent.
- This client does not implement Venice's E2EE handshake or TEE attestation verification. It excludes model IDs requiring E2EE and does not advertise encryption beyond HTTPS.
- Native image generation returns base64 or binary data directly to local history. Prompt EXIF metadata defaults off. Prompt enhancement is opt-in.
- Local tools run within the existing host and approval mechanisms. Data returned by tools can become part of the model conversation and be sent to its selected provider.

## Optional audio, video and music

Audio/video/music modules are off until explicitly enabled. From 1.26.0 the internal Venice MCP is available by default when the provider has a key and is enabled, only to Venice models in Work Mode; it has its own switch in MCP and provider settings. It cannot enable disabled media modules. Image generation always opens a human approval dialog. Studio media history opens locally; its media catalog loads on request. Provider/model and image selectors can refresh the authenticated model catalog, and visible Venice credit widgets request `/billing/balance`. Neither request generates content or incurs an inference request. Loading models, quoting, generation, polling and cleanup contact the configured Venice endpoint directly. Transcription uploads the selected file. Speech/video/music prompts and additional parameters are sent to Venice without E2EE. No background paid re-creation happens on startup or failure.

Queue IDs, model IDs, prompts, status and media are stored locally. A SHA-256 credential fingerprint binds resumable jobs to the original endpoint/key; the media records do not duplicate the API key. Media blobs use their own namespace and explicit deletion. Studio history is currently outside the portable chat/image backup format: export wanted media before resetting or migrating the app. Device encryption, app storage protection and separately created backups remain the user's responsibility.

After video/music bytes are saved successfully, the app requests remote completion/cleanup. A failure leaves the local result and a retry control. Deleting a local record does not implicitly contact Venice. A remote cleanup confirmation represents Venice's response; the client cannot independently verify provider retention. Stopping polling or closing the app does not necessarily cancel a running server job.

Media tools are registered only for Venice models in Work Mode when enabled. List/status/resume/delete are limited to records created for the current chat. Default approval precedes paid generation; destructive tool actions always require approval. Local filesystem tools retain the existing permissions and approvals; their results may be sent to the selected chat model.

The internal MCP uses a client/server pair connected by an in-memory transport inside the app. It does not start a process, open a port or send tool messages to a separate MCP host. API calls still contact Venice directly. Image tool records and status are limited to the current chat; user-selected references and per-call parameters are saved with the image generation. Model names are matched against the available catalog; ambiguity requires user selection.

Microphone recordings stay local until the user submits transcription. Tracks are stopped after recording or leaving the component. Model documentation opens only on a user action; the embedded webpage can contact Venice and its website resources independently of the API.

Venice embeddings send the indexed text to Venice. The app keeps the knowledge-base documents and vector index locally using the existing RAG implementation. Privacy/uncensored icons reproduce provider metadata; they are not a verification of retention or encryption.

## Delete generated content

Delete an entry in Image Creator history to cancel any active request, delete the local record, and clean up generated/reference images that are no longer used by another record. Exported copies and user-created backups must be deleted separately from their saved locations. Local deletion is not a remote deletion request to Venice or a search provider.

## Other inherited features

Tracking and error reporting default off for new settings. Imported or previously saved choices remain as selected. Desktop document parsing defaults to local; mobile defaults to no automatic cloud parser. Optional Chatbox services, third-party providers, MCP servers and cloud parsers have their own data flows and require configuration. Public model catalogs or optional service metadata may still be requested by inherited app features. A local-first app is not necessarily offline.

Auxiliary summary generation respects the selected local model settings; remote configuration cannot silently choose another provider for a summary. Explicitly choosing a separate fast model authorizes its use for auxiliary tasks.

Update checks contact this fork's public GitHub release feed without sending an installation identifier. Release downloads are served by GitHub. Check the policies of Venice, any search service you select, GitHub, and any other service you explicitly configure.
