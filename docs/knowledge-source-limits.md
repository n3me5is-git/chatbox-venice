# Knowledge source limits

Knowledge collections accept source files up to **50 MiB** (displayed as 50 MB), matching the existing classic desktop knowledge-base upload limit. The same bound applies to the encrypted/public source manifest, replacements, linked-folder scans, reads and backup restoration. Existing small-file collections remain readable without reindexing just because this limit changed.

Uploads are read, hashed and encrypted in 1 MiB slices, one file at a time. Linked-source scans hash streams rather than buffering each file. Desktop and Android source reads use a read-only `read-chunk` capability with an explicit folder binding, maximum 1 MiB per response and final SHA-256 validation before publication. Changed grants, short reads, size changes and mixed file revisions fail closed without deleting the previous collection snapshot.

The limit concerns stored **source bytes**. It does not increase unrelated limits:

- Ordinary chat workspaces and generated-code execution retain their existing file bounds.
- The collection database's individual JSON record bound remains 10 MiB; source binaries live in chunk records, not a monolithic JSON value.
- Selected parser output, archive expansion, PDF OCR page/raster bounds and provider limits remain active. A valid file size is not a guarantee that every document's expanded contents can be processed.
- Raw HTML/RTF parsing retains its 10 MiB input guard; Office archive and extracted-text guards are unchanged. Large or complex documents that exceed these limits must be split.
- Inline image OCR and direct media embeddings retain their separate 10 MiB bounds. Larger photos may still be stored, but need resizing before inline processing; provider-specific STT limits also apply.

The shared RAG Office parser runs in a disposable, read-only worker with a transferable binary copy. It does not copy a large base64 source into the generated-code execution sandbox or raise that sandbox's permissions. Indexing still needs the current source in memory, with parser-specific allocations; bounded ingestion does not claim constant total process memory for every document format.

The portable directory schema now accepts 50 MiB source entries; records, embedding-space identity, chunk boundaries, encryption and publication contracts retain their formats. The originals of linked files remain read-only and are not modified by the application.
