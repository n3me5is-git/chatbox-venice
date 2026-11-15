# Portable Knowledge Directory, version 1

This document specifies version 1 of the Portable Knowledge Directory protocol. It is an application format, not a claim of OCFL, RO-Crate, RDF, SQLCipher or BagIt conformance. Independent implementations are welcome; the reference reader follows this repository's license.

## Purpose and storage boundary

A collection is a root directory containing ordinary source subdirectories and a reserved `.rag-collection` directory. Sources, parsed text, OCR/transcripts, vector shards, extracted metadata and graph provenance belong to that collection. The application's central catalog holds only a local mount ID, the persistent collection UUID, a native root capability, local access policy, and device-local provider mapping/consent. It does not contain a second vector database or an asset-header mirror. Small citation receipts already integrated into conversations remain application conversation data.

Existing app-backed encrypted collections and legacy desktop collections keep their existing layouts. Moving a collection is explicit and does not call a model. The source app copy is retired only after the external copy authenticates. Ordinary linked-source mode still copies documents into app storage; linking a source folder alone is not the same as moving its database.

## Directory layout

~~~text
project/
  requirements/specification.pdf
  meetings/2026-11-14.wav
  notes/decisions.md
  .rag-collection/
    collection.json
    v1/records/
      values/<SHA256(logical-key)>/
      headers/<SHA256(logical-key)>/
      aliases/<SHA256(logical-key)>/
      chunks/<SHA256(logical-key)>/
        <record-uuid>.json
        <12-digit-sequence>_<record-uuid>.commit
~~~

The source scan is recursive, hashes actual bytes, rejects symlinks and excludes `.rag-collection`, `.chatbox`, `.git`, `node_modules` and `.venv` at every depth, followed by configured exclusions. Knowledge scans are bounded at 64 levels and 50,000 examined entries; an index supports 10,000 documents and 100,000 passages. Each source is at most 10 MiB and each path at most 240 characters. An incomplete, inaccessible or truncated scan is never treated as an empty deletion snapshot. Sources are read-only through the knowledge capability; write permission is narrowly restricted to the reserved database subtree.

A nested collection's database is excluded. Ordinary documents beneath a nested root are still part of a recursive parent scan unless that subtree is explicitly excluded. Mounting both can intentionally produce overlapping evidence; this is not automatic deduplication across distinct collections.

## Optional public, unencrypted collections

Encryption is enabled by default. Creation and migration can explicitly select an unencrypted folder database. Its descriptor declares `cipher:"none"` and `integrity:"sha256-v1"`, and contains no key or KDF fields. Existing encrypted databases are never silently converted by this choice. Opening an existing collection detects its actual format: encrypted collections require their passphrase, public collections do not. Both retain separate device-local provider consent and read-only mounts by default.

In public mode record-object files contain the UTF-8 JSON value directly; immutable commit markers still hash the exact object bytes. Assets use `plain-chunks-v1`: key marker `{iv:"none",data:""}`, UTF-8 JSON info `{iv:"utf8-json-v1",data:<JSON>}`, manifest `{iv:"sha256-v1",data:<JSON {bytes,chunks,hashes}>}`, and chunk records `{encoding:"base64-v1",data:<base64 bytes>}`. Each chunk hash is SHA-256 of its decoded bytes. Source asset UUIDs and aliases are preserved when streaming existing encrypted content into a public database. No model calls or re-embedding are needed.

Anyone with the folder can read all public collection content. Checksums detect accidental damage; an adversary can change plaintext and recompute hashes. Local PIN/biometric controls only gate access inside the application. Credentials and local policies are not exported, and imported text/metadata remain untrusted. Public-mode migration is a new destination operation, not an in-place encryption toggle or secure erasure of previous copies.

## Bootstrap descriptor and keys

`collection.json` is UTF-8 JSON with `format: "portable-knowledge-directory"`, `version: 1`, an RFC 4122 version-4 `id`, ISO-8601 `created`, `writer: "single"`, `cipher: "AES-256-GCM"`, `kdf: {name:"PBKDF2-SHA256",iterations:600000,salt:<base64 16 bytes>}` and `key: {iv,data}`. The collection master key is 32 independently random bytes, wrapped with the passphrase-derived AES-256 key. Wrapping AAD is UTF-8 `portable-collection:<uuid>:key:v1`. AES-GCM uses random 12-byte nonces and 128-bit tags; the tag is appended to ciphertext before standard padded base64 encoding. Passphrases are 12–1024 characters when created; no plaintext passphrase is persisted.

The master key is independent of Android Keystore, Windows device keys, PINs and biometrics. The latter authorize access locally; transferring a folder never transfers local device authorization or provider credentials. In this version the unlocked master key is cached in memory for the mount and reopening after restart requires the collection passphrase. A monotonic authorization epoch invalidates operations that were started before lock/unmount, including lock followed by reopening the same root.

The database is encrypted. Ordinary originals elsewhere under the root retain their original protection and may be plaintext. Size, directory counts, UUIDs, KDF parameters and access patterns are not hidden. Passphrase sharing must happen separately. A complete earlier valid directory can be replayed: this format has no remote anti-rollback authority. It does not attest the model weights or provide distributed multi-writer consensus.

## Record database

A logical key is nonempty UTF-8 text of at most 2,000 characters. Keys starting `headers/`, `aliases/` or `chunks/` use that namespace; other keys use `values`. The directory name is lowercase hexadecimal SHA-256 of the full logical key, encoded as UTF-8. Readers must validate paths, bounds and symlinks before opening files.

The immutable object `<uuid>.json` contains a sealed `{iv,data}` envelope under the master key. Its AAD is `<collection-uuid>:record:<logical-key-sha256>:v1`. The decrypted UTF-8 JSON is `{version:1,id,sequence,parent,key,value}`: `id` is this record UUID, `sequence` is a positive safe integer, `parent` is the previous committed record UUID or null, `key` is the logical key, and `value` is a string or null tombstone. Never run or interpret a value as code.

After writing and reading back the entire object, the writer exclusively creates the commit marker `{version:1,id,sequence,parent,hash}`. `hash` is lowercase SHA-256 of the exact UTF-8 sealed-object file bytes. A marker is published only after complete object read-back; an object without a marker is staging garbage, not a visible record. A reader checks marker shape, sequence/parent consistency, exact object hash, GCM authentication and all repeated identity fields. Forked heads, malformed committed records, unknown cipher/KDF versions and missing authenticated payloads fail closed. Missing source roots are errors, not empty databases.

Per-key revisions are independent. The RAG generation manifest is published after its source/shard data. There is no transaction across separate collections or a whole-directory filesystem snapshot. The writer retains two committed versions per live key. For a deletion tombstone it prunes previous committed payloads and keeps only the tombstone; it does not deliberately retain deleted document bytes as readable history. Cleanup processes oldest markers first, stops on deletion failure and never deletes a payload while its marker could remain. A reader whose captured head was removed by cleanup may retry against a newer validated head, at most three attempts; it must not silently accept corruption at an unchanged head. Competing writers are unsupported even if their branches can often be detected. SAF read-back is not a promise of atomic rename, durable fsync, or power-loss recovery.

Copy the folder while its writer is stopped. Opening normally is read-only. Enable writing explicitly on one device after closing other writers. The writable collection panel also offers **Clean database storage**, which removes orphan chunks, uncommitted object files and obsolete record versions under an exclusive collection gate. Filesystem deletion is not a claim of forensic secure erasure on flash media, and separately copied backups keep their own contents. On failed migration the original catalog/grant remains usable; a source-signature-bound bootstrap allows resuming the same source revision. A native pending grant is adopted only after authenticated completion. Unmount removes the local binding and leaves the folder untouched.

## Asset layer and logical records

Record values use the existing versioned chunked asset representation:

- `headers/<asset-uuid>`: JSON asset header, including logical alias, scope label, byte/chunk counts, status, wrapped data key, encrypted info and authenticated length manifest.
- `aliases/<sha256(canonical-alias)>`: ready asset UUID. Publish an alias only after the asset header and all chunks are ready.
- `chunks/vault-v1-<asset-uuid>-chunk-<n>`: JSON `{iv,data}` for a data-key encrypted chunk, at most 1 MiB of plaintext. The last chunk may be shorter. The outer record envelope also protects these records.
- `collection-bootstrap`: source revision signature for resumable migration; never authorization to invoke a provider.
- `collection-config`: portable configuration and schema entry points, written after a complete migration.

An asset has a random AES-256 data key. Master-key wrapping AAD is `<asset-id>:key:<scope-label>:<physical-alias>`; info AAD is `<asset-id>:info`; authenticated manifest AAD is `<asset-id>:manifest`; chunk AAD is `<asset-id>:chunk:<n>`. Authenticate byte count and chunk count before and during streaming. Physical alias/scope strings are part of authenticated AAD: do not rewrite them when a collection is mounted under a different local ID.

For lookup only, canonicalize an alias beginning `knowledge-collection:-<digits>:` to `knowledge-collection:<collection-uuid>:`. This separates physical authenticated asset identity, persistent collection identity and application-local mount identity. The manifest alias is supplied by `collection-config.records.sourceManifest`; vector and advanced generation paths are supplied there too. A source manifest contains file IDs, relative paths, MIME types, SHA-256 revisions, immutable asset UUIDs and optional root-relative `linkedPath`. There are no absolute paths, native grant tokens or API secrets in the portable source manifest.

## Model and processing contract

`collection-config` declares its version, collection UUID, application storage namespace hint, embedding contract, processing/chunker settings and record schema names. Local provider IDs in saved settings are hints, not portable identity or credentials. OCR, transcription, extraction and reranking roles additionally declare API model ID, provider type and a credential-free endpoint when known. A recipient maps them to locally configured providers and grants fresh consent; importing metadata never installs code, approves endpoints, loads arbitrary models, or starts paid calls.

The embedding descriptor has named versioned fields: provider type, sanitized endpoint origin/path, API model ID, requested dimensions or null, transport ID, declared model revision or null, cosine metric, L2 normalization, and separate query/document prefix and taskType settings. Its portable-space identity is SHA-256 of deterministic recursively key-sorted JSON. This restricted JSON serialization is `sorted-json-v1`, not a claim of complete RFC 8785 conformance.

Every newly written vector generation stores `portableSpace` with that contract hash and its full `portableDescriptor`, together with the original local `embeddingSpace`. The generation descriptor remains authoritative even if a later update to the human-readable collection-config fails. A local-ID rebind is allowed only after the generation's own portable-space identity matches the local contract. A separate, possibly stale config record is not enough. Existing indices may be annotated during migration only after their original endpoint/model binding is verified. Changing the endpoint, revision, dimensions, task instructions or transport requires rebuilding; rotating a credential does not. Models with mutable aliases and no declared weight revision cannot provide a cryptographic guarantee of identical server weights.

Vector shards contain at most 32 chunks. Each chunk retains source SHA-256, original file path, text, line/endLine and optional page/modality. Vectors are either legacy JSON finite-number arrays or `{encoding:"float32-le-v1",dimensions,data}`, standard canonical padded base64 of exactly 4 × dimensions little-endian IEEE-754 finite float32 bytes. Parsed text uses normalized LF; citation offsets are UTF-16 code units. Chunker v2 targets 1,200 characters with 150-character overlap and respects sections/pages; the contract records this explicitly.

A source change invalidates only the affected file's source/vector/metadata contributions. Exact unchanged chunks and extraction windows are reused. OCR/transcripts and optional parsed Markdown are retained as source-bound derivatives, not mistaken for originals. Extracted relations/tags are interpretations with source/text hashes and quote offsets; they are not proof that a claim is true.

## Retained derived-text compression

Logical assets under `.chatbox/knowledge/text/*.json` use one of two records, independently of the collection's encryption mode:

- Version 1: `{version:1,text,kind,sourceHash,textHash,fingerprint,warning?}`.
- Version 2: replace `text` with `encoding:"gzip-base64-v1"`, `utf8Bytes` and `data` (canonical padded base64 of a gzip stream). All other provenance fields remain unchanged.

Compression happens before the existing chunked-asset encryption. It applies only to derived text, not source PDFs, images, vectors or graph records. A writer uses compression for UTF-8 text of at least 4,096 bytes only when the encoded payload plus a 128-byte allowance is smaller than 90% of the original text bytes. This threshold is not a promise about whole-vault savings. Readers continue to accept version 1; unavailable compression falls back to version 1 when writing.

The SHA-256 `textHash` always covers the exact decompressed UTF-8 text. Citation offsets remain UTF-16 code units in that text. Bound decompression by the declared byte count (maximum 2,048,000), check the exact length, validate UTF-8 and verify the text hash before use. The decoded string is limited to 512,000 UTF-16 code units. Gzip integrity, envelope authentication and source-revision checks serve different purposes; none replaces the others.

The optional `collection-config.records.derivedText` declaration advertises versions and codecs. The independent Node reader exposes `textAsset(alias)` and `decodeKnowledgeText(record)` for both versions. Ordinary `jsonAsset` preserves the stored representation. Repacking text does not change parser fingerprints, source revisions or embedding identities, so it does not itself invoke OCR, embedding or extraction again.

## Virtual federation and graph semantics

Mounted collections retain independent vector spaces and databases. Search keeps only bounded candidates, executes at most two collections at a time and combines ranks by reciprocal rank fusion. Raw scores/vectors from different spaces are never directly compared. Equivalent query embeddings may be reused within the same operation; no cross-session query cache is persisted. The current explicit all-collections operation is bounded at 256 unlocked, consented mounts.

Federated graph node identity is `<collection-uuid>:<entity-id>`; app-backed collections use a local scope instead. Edges retain collection ID/UUID, file ID, source/text hashes and quotation anchors. Graph pages are bounded and loaded on demand; no global graph mirror is written into the app database. Unmount removes that collection from the virtual union. Homonyms across collections are possible matches, never automatically the same real-world entity. General RDF/OWL identity reconciliation, transactional cross-device synchronization and ANN indexing are outside v1.

## Interoperability and references

Machine-readable schemas: [portable-knowledge-v1.schema.json](portable-knowledge-v1.schema.json). Dependency-free reader: [reader.mjs](../scripts/portable-knowledge/reader.mjs), requiring Node.js 22 or later. It opens local collections without application initialization, network access or provider credentials and streams authenticated assets.

The design draws on separate concerns: [OCFL 1.1](https://ocfl.io/1.1/spec/) for application-independent inventories and fixity; [BagIt, RFC 8493](https://www.rfc-editor.org/rfc/rfc8493) for checksummed transfer packaging; [RO-Crate 1.2](https://www.researchobject.org/ro-crate/specification/1.2/) for machine-readable research metadata; [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) and [PROV-O](https://www.w3.org/TR/prov-o/) for stable identity and provenance; and [SQLite ATTACH](https://www.sqlite.org/lang_attach.html) for the distinction between virtual composition and physical merging. [SQLite WAL](https://www.sqlite.org/wal.html) explicitly does not provide one atomic transaction across attached databases. These references motivate the architecture; this directory protocol is deliberately explicit about its own narrower guarantees.
