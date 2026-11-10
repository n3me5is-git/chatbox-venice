# Protected knowledge collections

The global Knowledge Base page now offers encrypted, reusable collections on desktop and Android. Each chat selects one collection from its tools panel. Session RAG remains separate and indexes that chat's workspace; both use the same local extraction and recursive chunker.

## Documents and embeddings

Add documents, review embedding/OCR settings and explicitly save processing consent. Index now is a separate action; opening the page, copying a legacy collection or selecting it in chat does not buy embeddings. New configurations prefer a configured Venice embedding model explicitly marked `private` by the provider catalog; unknown and anonymized models are not described as private. Existing saved choices are preserved.

Local extraction supports PDF, legacy DOC, DOCX, XLSX, PPTX, EPUB, ODT/ODS/ODP, RTF, HTML, Markdown, UTF-8 text and source code. EPUB follows the package spine. Archive expansion, nesting, worker lifetime and extracted-text limits remain bounded. Legacy binary XLS/PPT still require conversion or the original desktop/cloud parser. This does not add Office viewers. The browser-safe recursive splitter uses the global KB's 1,200-character target and 150-character overlap, prefers structural boundaries and retains original line/page references. Its version invalidates old session RAG indexes; rebuild existing indexes once.

Photos and audio have separate direct-embedding switches. Native media takes priority over OCR and is never silently transcribed. Direct Gemini Embedding 2 supports native media through its Gemini API adapter. As verified against Venice's live API on 2026-11-10, Venice's `/embeddings` currently accepts strings/string arrays only, including `gemini-embedding-2-preview`. Native media stays unavailable on that transport; no base64 media is disguised as text. Local extraction does not imply offline embeddings: selected embedding, OCR and optional rerank providers receive their enabled inputs. Chat E2EE does not cover these separate requests. Optional reranking supports Cohere-compatible and DashScope APIs; its query and candidate passages go to the selected reranker.

## Encryption and authentication

Original sources, collection names, file metadata, extracted passages and vector shards use the existing authenticated vault encryption on disk. The small discovery registry holds opaque IDs, timestamps and access scopes, not document names or passages. The backend is a manifest and bounded encrypted shards, not a second SQLite/WASM engine. It uses exact vector similarity and inherits the session RAG limits: 10 MiB/document, 2,000 documents and 20,000 chunks. Queries load shards sequentially.

Collections can use encrypted device storage without extra unlock, the app's configured unlock methods, or a dedicated PIN/passphrase and/or device biometrics. Credentials and biometric results never enter tool arguments or the model context. A locked collection's first list/search/read request opens an owner-device authentication dialog. Declining fails that tool call without contacting the embedding provider. Unlocked access lasts until the applicable scope locks; Lock now is available in the manager. App lock and background lock rules still apply. Configuring app unlock must be done in Data & Backup first.

Protection changes publish a fail-closed transition before rewrapping asset keys. If interrupted, both applicable keys are required until the operation is completed. Locking during indexing aborts the job; checks before and after network requests prevent a late result from returning protected content. Do not treat an app-local PIN as a boundary against a compromised device. Previously sent excerpts remain in chat/model history and are not retroactively revoked when a collection is locked.

## Legacy desktop collections

Existing positive collection IDs retain their original desktop backend and remain usable. The original manager remains reachable for its larger file limit and cloud parsers. Its SQLite index remains unencrypted; protecting a new collection does not make that legacy copy encrypted. Android cannot open that old desktop database directly.

Copy to encrypted collection exports the already indexed text locally into new encrypted Markdown sources, without provider calls. This is an explicit content copy, not a byte-identical restoration of the original Office/PDF document or its old vector database: overlapping old chunks can appear in the copy, and incomplete old indexes contain only available text. Original collections remain until separately deleted. Verify the copy, choose privacy settings, build its new index and then delete the legacy copy if desired. Database deletion does not promise forensic erasure on SSDs or deletion of original source files and independent backups.

Protected collections are device-local. Session collaboration and direct session transfers do not grant access to or copy the global collection. Choose/import the knowledge separately on another device. General session file tools cannot enumerate collection source/vector storage.

Encrypted library backups in Data & Backup include accessible collection originals and metadata, with streaming export. Derived vectors are excluded. Restore recreates collections under new IDs in the destination area selected by the user, preserving existing collections. It does not copy device-bound PIN/biometric envelopes: configure destination protection again if needed. Fresh embedding/OCR consent and reindexing are required before the restored collection can make provider requests. Collection internals do not clutter the media-library management list.

## Validation

Actions run collection encryption/unlock/lock-during-query tests, EPUB/RTF/OpenDocument parser fixtures, recursive chunk/reference tests, mobile collection UI tests, existing RAG regression suites and full TypeScript checks. Small authorized live Venice probes validate private BGE-M3, private Qwen3 and Gemini text embedding responses, plus rejection of multimodal input on the Venice endpoint. Native device fingerprint behavior still depends on the platform's configured biometric enrollment and must not be inferred solely from simulated device-protector tests.
