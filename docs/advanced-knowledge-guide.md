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

In Work mode, an explicit intermediate `knowledge_verify` tool can assess a draft against selected canonical collection receipts. It authenticates the owner where needed and uses the same consented verifier. The tool is unnecessary before ordinary final answers, which are already reviewed automatically. An explicitly requested intermediate review can add up to three model calls per invocation, in addition to the final review. Android Work activates the same selected KB/federation tools both for new generations and resumed tool calls.

The verifier checks exact answer spans and source quotations. Optionally, one conflict correction is followed by another check of the actual final text: at most three model calls per reviewed segment. Invalid quotes/IDs cannot become supporting evidence. Limits are 32 claims, 32 sources, 24,000 answer characters and 64,000 source characters. The 95% non-whitespace coverage rule is a heuristic, not proof of completeness.

A source-review result can be checked, incomplete or unverified. Missing sources, model failure or exceeded limits can publish the answer with an explicit attention status; this is not a truth-enforcing firewall. Revoked access or changed source/settings aborts publication. Citation badges and **Source review** open claim assessments, quotations and external links; unsupported/model knowledge is labeled. Editing an answer invalidates its displayed review status. Corrected text does not inherit the original provider response's attestation badge.

Reports belong to the conversation and contain source quotations/rationale. Conversation access/backup/sharing therefore governs those copies, not the original collection's lock alone. A source-support assessment is separate from transport encryption and attestation, and does not establish real-world truth or legal compliance.

Auxiliary model calls and implicit worker reviews are not globally intercepted. Externally spawned workers cannot silently add paid verifier calls; use the separately permitted verification tool where needed.

## Graph and desktop MCP

The graph explorer is a bounded view, with filters, pan/zoom and source-linked relations. It displays at most 150 nodes and 300 edges; it is not an exhaustive graph export or a continuously animated layout.

Desktop application MCP endpoints can explicitly grant selected collections for search, metadata, document and evidence tools. Knowledge access is off by default and is unavailable in router-only mode. Verification also requires model permission, an allowed model/privacy route and owner approval unless automatic calls were explicitly enabled. Conversation generation with source review uses the same publication boundary and separate secondary-model permissions. Source revisions and grants are checked around asynchronous operations.

## Backup and compatibility

Encrypted library backups include accessible sources and collection metadata. Restores create fresh collection IDs, omit derived caches and OS directory grants, and require local provider consent/reindexing. Dedicated PIN/biometric envelopes are device-bound and must be configured again. Legacy desktop collections remain separate and unencrypted until explicitly migrated/deleted. Protection is not forensic erasure or protection against a compromised device.

## Self-contained folder collections

The original linked-source option keeps encrypted copies inside the application archive. To put the collection database alongside the source tree, choose **Move database into folder** in that collection. Select its root and create a separate collection passphrase. This copies existing sources and indices, verifies encrypted data, then retires the app-owned copy. No document embedding or extraction call is made during migration. Cancelling preserves the previous source binding; interrupted migration can resume from the same unchanged collection revision.

The reserved `.rag-collection` directory holds the independent database. Source scanning is recursive and excludes that database at every level. Native knowledge access permits reading originals and writing only the reserved database subtree. Automatic incremental refresh remains optional and may charge the selected providers only for changed content.

To transfer a collection, stop its writer and copy the entire root, including the hidden database directory. On the recipient device, choose **Open folder collection**, select the root and enter the collection passphrase. Opening does not import API keys, automatically approve providers or require document re-embedding. The stored graph and retained text can be explored before configuring providers. Map the original embedding model/endpoint and save local consent before semantic search; a query still needs its own embedding. A different embedding space requires an explicit rebuild.

Read-only is the default. To modify source copies or indices, reopen with writing enabled and use only one writer for the physical root. Do not concurrently update the same folder from cloud-sync clients or multiple devices. Unmount removes local registration/grants while preserving folder data. Local PIN/biometrics gate application access, but the transferable passphrase is required after restart and is needed on another device. Ordinary originals outside the encrypted database can remain plaintext. Application library backups do not include this external database: back up the root itself.

**Search across collections** searches unlocked mounts with local provider consent. Compatible spaces reuse one query embedding within the operation; rank fusion combines different spaces. **Explore combined graph** loads bounded, source-owned graph pages across unlocked advanced collections, without a central graph mirror or automatic homonym merging. Desktop MCP endpoints can expose that same graph under their selected-collection permissions.

See [Portable Knowledge Directory v1](portable-knowledge-v1.md), its [JSON Schema](portable-knowledge-v1.schema.json) and the [independent reader](../scripts/portable-knowledge/reader.mjs) for integration details and precise limits.

A writable folder collection also provides **Clean database storage** for orphan chunks and interrupted/stale record objects. Deleting a document prunes its older payload records; cleanup does not overwrite flash sectors or erase independent backups.

Source review measures coverage of visible content using Markdown structure. Citation destinations and recognized source labels are excluded; factual link labels remain reviewable. New reports require complete visible-content coverage for the overall checked state. Historical reports retain their original assessment policy. Coverage and source quotes are evidence checks, not proof that a source or a model is correct.

## Public collections and visual enrichment

Folder database encryption is on by default. For a public collection, explicitly disable **Encrypt the folder database** during creation or migration. The result contains no portable encryption key or password requirement; anyone with the folder can read it. File and chunk checksums detect accidental damage, not malicious rewriting. Local PIN or biometric gates only apply inside this app. An existing encrypted folder is never silently downgraded; use **Connect existing** in the creation dialog, or **Open folder collection**, to detect its actual mode. The app still requests local provider mapping/consent and defaults to a read-only mount.

**Describe images and PDF pages for search** uses the selected vision/OCR model to retain a brief, explicitly inferred visual description alongside enabled OCR text. It does not make a diagram description authenticated source text. Ordinary native media embeddings keep their previous precedence over OCR/STT; enabling the new description or file-metadata option can add separately embedded text beside a native media vector. The advanced metadata path can separately extract media text when its own option is enabled.

**Index file metadata** adds original filenames, paths, MIME/byte information, PDF properties and supported JPEG EXIF/PNG text fields. Author, camera and capture-date fields are editable claims supplied by the file. GPS coordinates require the separate **Include photo GPS coordinates** opt-in. JPEG/PNG image uploads remove embedded EXIF/XMP/IPTC/comments or text chunks before vision/native embedding requests, retaining JPEG orientation and encoded pixels. Explicitly selected metadata is sent as labelled text to configured processors. Other image formats do not gain an implied metadata-sanitization guarantee.

Derived descriptions and metadata follow the source hash and parsing settings, participate in incremental updates, and can be searched/read through the existing KB/session tools and desktop MCP permissions. Filename words are also available in lexical retrieval without rebuilding stored text.

Source review and OCR offer a **concise** mode that uses only a catalog-supported low/off thinking setting, scoped to the auxiliary request. Existing automatic reasoning remains valid. Concise mode leaves a bounded output budget for JSON; an incomplete or invalid judge response remains unverified. It is not an accuracy guarantee.
