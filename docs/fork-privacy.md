# Privacy and data flows

This fork stores chats, provider configuration and generation history locally using the existing Chatbox storage adapters. It does not operate a hosted relay or synchronization service.

## Venice

- Authentication uses the API key you enter locally. The build workflow never receives it.
- Chat prompts, selected attachments, search queries and image prompts are sent directly to the configured Venice API endpoint over HTTPS.
- Selecting Brave, Google or Exa calls Venice's retrieval API. Venice routes the query to that search service. X search is model-dependent.
- This client does not implement Venice's E2EE handshake or TEE attestation verification. It excludes model IDs requiring E2EE and does not advertise encryption beyond HTTPS.
- Native image generation returns base64 or binary data directly to local history. Prompt EXIF metadata defaults off. Prompt enhancement is opt-in.
- Local tools run within the existing host and approval mechanisms. Data returned by tools can become part of the model conversation and be sent to its selected provider.

## Delete generated content

Delete an entry in Image Creator history to cancel any active request, delete the local record, and clean up generated/reference images that are no longer used by another record. Exported copies and user-created backups must be deleted separately from their saved locations. Local deletion is not a remote deletion request to Venice or a search provider.

## Other inherited features

Tracking and error reporting default off for new settings. Imported or previously saved choices remain as selected. Desktop document parsing defaults to local; mobile defaults to no automatic cloud parser. Optional Chatbox services, third-party providers, MCP servers and cloud parsers have their own data flows and require configuration. Public model catalogs or optional service metadata may still be requested by inherited app features. A local-first app is not necessarily offline.

Auxiliary summary generation respects the selected local model settings; remote configuration cannot silently choose another provider for a summary. Explicitly choosing a separate fast model authorizes its use for auxiliary tasks.

Update checks contact this fork's public GitHub release feed without sending an installation identifier. Release downloads are served by GitHub. Check the policies of Venice, any search service you select, GitHub, and any other service you explicitly configure.
