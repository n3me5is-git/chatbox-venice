# Session RAG and linked workspaces

Reusable [protected knowledge collections](protected-knowledge-collections.md) are also available on Android and desktop. They remain separate from a chat's workspace index and share its local extraction/recursive chunking pipeline. EPUB, OpenDocument, RTF and HTML are now supported as well; rebuild older session indexes once for the updated chunker. Native photo/audio embedding stays independent from OCR/transcription and requires a compatible API transport (direct Gemini Embedding 2; Venice currently accepts text only).

## User workflow

Open **Session RAG and indexing** from the chat header. The mobile header scrolls horizontally when its actions no longer fit. Select an embedding model, review the remote-processing notice and save. **Index now** builds or updates the index. Automatic updates check the tree every 15 seconds while the app is visible and unlocked. An unchanged failed tree is not retried automatically; use Index now after investigating the error.

Text extraction happens locally for PDFs, Markdown, DOC/DOCX, and UTF-8 text, including source files. DOCX and other supported modern Office containers reuse the existing document parser. Legacy DOC uses a vendored 0BSD parser in a disposable worker with a timeout. Scanned PDFs need optional OCR, with a separately selected vision model. Photos and audio have independent switches and require supported native multimodal embeddings (Gemini Embedding 2). No automatic transcription, cloud parsing or fallback to a Chatbox account is performed.

Save settings grants permission **on this device** to the selected embedding/OCR configuration. Chat, app and project locks remain enforced. Embedding/OCR providers receive the enabled source content; their privacy properties may differ from an encrypted chat model. E2EE chat does not imply E2EE embeddings or OCR.

## Index architecture

`SessionRagEngine` has an injected storage/extraction/embedding port. SHA-256 content hashes identify unchanged source files. Changing the provider, model, dimensions or extraction modalities invalidates reuse. Vectors are normalized, searched by cosine similarity and processed in bounded shards. Search results are checked against current source hashes; stale or deleted content is excluded, and retrieval checks again before returning passages.

The local database is a manifest and encrypted vector shards under `.chatbox/rag/`, stored using the existing vault-backed session file store. This file database avoids introducing a second SQLite/WASM engine on mobile. It is not an SQLite database or an approximate-nearest-neighbor service. Shards contain at most 32 chunks and are loaded sequentially; the complete library is not loaded into RAM. The index is not a media deliverable and is always excluded from its own indexing. Index files stay in encrypted app storage even when a real folder is linked.

Indexing writes new shards and commits the manifest last. Cancellation and fatal provider failures retain the previous committed manifest and remove staged shards. Per-file extraction failures appear in the panel. Settings changes, app/project locking and backgrounding abort active indexing. Queries remain on demand and may incur provider charges. Clear index removes vectors and extracted passages, preserving settings and source files.

The session exposes `session_rag_search` and `session_rag_read` only when RAG is enabled and the session's file tools are allowed. Dedicated agents use their own index; on-demand agents share their assigned workspace. Search returns chunk IDs, scores, snippets and `sandbox:/mnt/data/...` links. Retrieval returns passages with line/page references and treats source content as untrusted data. These links open the normal session file viewer. The existing text-search tool remains available. Desktop MCP access additionally requires the existing file-read/search permissions.

## Linked device folders

The native picker grants access to one real directory for a session. Desktop uses an Electron main-process broker; Android uses persisted Storage Access Framework grants restricted to device storage. Browser builds retain the app-managed tree. Grants and absolute paths are device-local and are not transferred as capabilities with a chat.

Linking replaces the main tree view; existing app files are preserved for disconnection. Reads, writes, uploads, code execution and file tools use the same session-store interface. Versioned file keys include a binding token and SHA-256 hash. Changed files reject stale writes rather than overwriting a newer version. Reconnecting the same directory changes the capability token. Traversal, symbolic links and direct access to reserved `.chatbox` paths are denied.

Dedicated agents receive `.chatbox/agents/<session-id>` beneath the parent root, with their own grant. The caller cannot browse these directories through its own workspace tools. Transfers still pass through the existing agent/guardian boundary. This is app-enforced capability separation, not an OS account or ACL boundary against the device owner. Revoking a parent grant invalidates dependent child grants. On-demand agents share their parent workspace by design.

External files are **not encrypted by Chatbox**. Use device/full-disk encryption if needed. Disconnecting a folder or deleting a chat revokes access and deletes app-managed data, preserving external files, including agent subfolders. Explicit file deletion from the explorer deletes that selected external file. Saving a linked file to deliverables creates a separate encrypted app-managed copy under `.chatbox/deliverables/`, preserving the external original. Workspace export snapshots linked files into temporary encrypted staging and removes those copies after export. Switch to app storage before importing an archive; restoring into an already linked folder is blocked to prevent ambiguous writes. Native multi-file writes are sequential and may partially complete after a later error; they do not provide an atomic filesystem transaction.

## Bounds and portability

- At most 2,000 encountered entries (including skipped names) and 16 directory levels per linked-tree scan, excluding `.git`, `node_modules`, `.venv` and reserved `.chatbox` folders. An incomplete scan blocks indexing.
- Existing session-store limits apply: 10 MiB per file. Large linked files are reported as skipped. Text extraction is bounded (500,000 characters; existing Office parser may return a shorter excerpt). OCR renders at most 50 PDF pages. Warnings identify truncation.
- At most 20,000 chunks per index, 32 chunks per shard, 8 passages per retrieval. Large corpora need smaller scoped workspaces; this implementation deliberately uses exact local search.
- Direct embedding media is capped at 8 MiB, audio at 60 seconds. Google API and account limits may be lower. Embedding dimensions must match across all chunks.
- Owner-encrypted workspace backups include managed index files after checking source privacy scopes. Collaborative shares and device-to-device transfers omit derived RAG caches; rebuild and approve the configuration on the receiving device. General file/execution/agent transfer tools cannot read raw index artifacts. Sources protected in another privacy scope are excluded even when their keys are unlocked. Retrieval rechecks this boundary; clear or rebuild an index to remove old cached passages after changing source protection. A linked-folder grant itself is never copied; select the receiving device's directory separately.
- RAG tools and the panel share code on desktop/Android. Native directory integration requires the Android plugin and Electron broker; it does not silently fall back to unrestricted filesystem access.

## Extending this design

New embedding adapters should implement the existing `RagInput` contract and explicitly declare supported modalities. Keep API transport in renderer adapters, checks before/after remote requests, and content parsing local. A future SQLite/vector backend can replace the shard port without changing tool schemas or consent. Replacing the folder broker should retain device-local grants, version/hash checks, reserved-path rules, child revocation and external-file preservation.
