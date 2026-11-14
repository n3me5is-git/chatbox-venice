# Hybrid knowledge collections and source review

Open **Knowledge collections** in the sidebar. Existing desktop collections keep their original backend. New portable collections keep sources, extracted text, vectors, graph records and receipts in the authenticated encrypted app archive on desktop and Android.

## Build a collection

Create a collection, select an embedding model and explicitly allow the selected providers to process documents. Add files, save settings and choose **Index now**. Local parsers cover PDF, DOC/DOCX, XLSX, PPTX, EPUB, OpenDocument, RTF, HTML, Markdown and source/text files. The limits are 10 MiB per file, 2,000 documents and 20,000 chunks. Document browsing is filtered and paginated, 50 rows per page.

Venice embedding requests are always text-only. Enable OCR and/or transcription separately when needed. Native image/audio embedding is offered only through a supported provider adapter; a model name alone does not establish transport support. Enabling native media does not silently enable OCR/STT or metadata extraction from that media. Chat encryption does not automatically encrypt separate embedding/OCR/STT requests end to end.

Optional collection settings add:

- **Hybrid retrieval:** exact semantic similarity and BM25, fused by rank. The initial vector scan remains linear, not approximate nearest-neighbor search.
- **Virtual reranking with LLM:** an explicitly selected text model orders at most 20 candidates. API reranking remains available separately.
- **Advanced knowledge extraction:** a selected model extracts source-anchored entities, open-schema relations, tags, key/value attributes and summaries. It cannot promote invented quotations to source evidence.
- **Retained text:** preserve parsed text as requested; OCR/transcripts are retained for source inspection. Source-derived records share collection encryption and access protection.

Model roles can be selected in **Settings → Default models** and overridden where offered. No model recommendation or automatic provider choice is installed by this feature. Optional processing can incur additional provider charges.

## Incremental changes

Ordinary indexing compares source SHA-256 revisions. Unchanged documents make no embedding or extraction calls. A changed document reuses exact compatible passages and extraction windows; new or shifted boundaries may need additional work. Replacing a container without changing its parsed text can reuse its analysis. Removing a document prunes its source-owned data without inference. **Reindex collection** explicitly rebuilds all vectors and bypasses reuse.

Embedding-space bindings include endpoint/model/transport/dimensions and declared revisions, excluding credentials. An incompatible binding requires explicit reindexing before paid work. Silent model changes behind an unchanged alias cannot be detected without a declared revision. New vector shards use compact float32 storage; legacy number-array shards remain readable without a paid migration.

## Link a device directory

In an open collection, use **Link a source folder**, then **Refresh folder and update index**. Desktop uses the native directory picker; Android uses a persisted local SAF grant. The collection namespace is authorized independently of chats and refuses native write, delete, mkdir or writable-child operations.

Sources are copied into encrypted app storage. The external originals retain their own device protection and are not encrypted or edited by this feature. The operating system/native broker keeps the local directory permission mapping; it is not transferred in a collection backup. The encrypted collection manifest stores the binding identity and display name.

Complete scans compare actual hashes, stage changed encrypted source assets and publish one source manifest. Derived indexing follows separately. Missing/revoked roots, oversize files or incomplete scans cannot be interpreted as an empty directory. Previous encrypted copies remain accessible. Changes outside the app become visible at refresh, rather than instantly; external filesystem scans are not transactional snapshots.

Automatic refresh is an explicit opt-in, checks every minute while the app is visible, and indexes changed documents using the saved provider consent. Locked collections pause. Backgrounding stops monitoring work; a recorded error requires manual refresh before automatic indexing resumes. Disconnect keeps encrypted copies and never deletes external originals.

## Use collections in a chat

Attach collections in the chat settings. Up to eight portable collections can be searched together. Vector spaces are searched independently and ranks fused; unrelated vectors are not mixed. Standard retrieval returns source links; advanced collections additionally expose bounded metadata/entity/relation tools. Protected access requests owner PIN/biometrics without putting credentials into the model context.

Citation links open an exact stored excerpt, adjacent context and the parsed document. Compatible local media/PDF previews are offered where the platform supports them; no Office viewer is added. Source replacement marks historical receipts stale; deletion makes them unavailable. A locked source is reauthenticated when opened. Text already authorized and copied into a chat, model request or MCP client cannot be retroactively revoked by locking the source.

## Check an answer before showing it

In **Chat settings → Knowledge**, enable **Check answers against sources**, choose the verifier and explicitly consent to sending that model the draft plus retrieved excerpts. This is independent of the chat model; their privacy policies can differ. Disable the switch to keep native publication behavior.

While review is enabled, tool cards and approvals remain visible but draft text/thinking is hidden until an outcome is available. The internal provider stream stays intact. Durable paused checkpoints preserve required reasoning and matching signed replay blocks as hidden protocol data. On steering, each finalized response segment is reviewed independently.

The ledger accepts actual portable-KB receipts and actual web-tool snippets. It does not treat draft links, arbitrary file/MCP output, model knowledge or invented URLs as independent evidence. Legacy desktop KB results and native searches without actual excerpts may remain unverified. No hidden web fetch is made to fill missing evidence.

The verifier checks exact answer spans and source quotations. Optionally, one conflict correction is followed by another check of the actual final text: at most three model calls per reviewed segment. Invalid quotes/IDs cannot become supporting evidence. Limits are 32 claims, 32 sources, 24,000 answer characters and 64,000 source characters. The 95% non-whitespace coverage rule is a heuristic, not proof of completeness.

A source-review result can be checked, incomplete or unverified. Missing sources, model failure or exceeded limits can publish the answer with an explicit attention status; this is not a truth-enforcing firewall. Revoked access or changed source/settings aborts publication. Citation badges and **Source review** open claim assessments, quotations and external links; unsupported/model knowledge is labeled. Editing an answer invalidates its displayed review status. Corrected text does not inherit the original provider response's attestation badge.

Reports belong to the conversation and contain source quotations/rationale. Conversation access/backup/sharing therefore governs those copies, not the original collection's lock alone. A source-support assessment is separate from transport encryption and attestation, and does not establish real-world truth or legal compliance.

Auxiliary model calls and implicit worker reviews are not globally intercepted. Externally spawned workers cannot silently add paid verifier calls; use the separately permitted verification tool where needed.

## Graph and desktop MCP

The graph explorer is a bounded view, with filters, pan/zoom and source-linked relations. It displays at most 150 nodes and 300 edges; it is not an exhaustive graph export or a continuously animated layout.

Desktop application MCP endpoints can explicitly grant selected collections for search, metadata, document and evidence tools. Knowledge access is off by default and is unavailable in router-only mode. Verification also requires model permission, an allowed model/privacy route and owner approval unless automatic calls were explicitly enabled. Conversation generation with source review uses the same publication boundary and separate secondary-model permissions. Source revisions and grants are checked around asynchronous operations.

## Backup and compatibility

Encrypted library backups include accessible sources and collection metadata. Restores create fresh collection IDs, omit derived caches and OS directory grants, and require local provider consent/reindexing. Dedicated PIN/biometric envelopes are device-bound and must be configured again. Legacy desktop collections remain separate and unencrypted until explicitly migrated/deleted. Protection is not forensic erasure or protection against a compromised device.
