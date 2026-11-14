# Advanced local knowledge collections

Status: implementation in progress. Existing encrypted and legacy collections keep their native behavior unless a feature is explicitly enabled. This document is the delivery map, not a statement that every item below has shipped.

Development is tracked in [draft PR #19](https://github.com/n3me5is-git/chatbox-venice/pull/19). Integrated: optional collection LLM reranking, BM25/vector rank fusion, atomic encrypted vector/metadata/text generations, OCR/STT derivatives, incremental source replacement and deletion. Source-linked chat citations, owner-authenticated excerpt viewer, paginated metadata/source tools and a bounded touch graph explorer are now under integration checks. Multi-collection federation, linked collection directories and pre-publication fact checking remain subsequent milestones. No new release is claimed by this document.

## Product goals

Optional LLM reranking; source-linked relational metadata and summaries; hybrid retrieval across selected collections; exact citations with context; optional pre-publication answer verification; a mobile-friendly knowledge graph; uploaded sources or explicitly linked read-only directories. English UI fallback and Italian translations. No extra local server, Python environment, graph service or mandatory native dependency.

## Research and adaptation

- [RankGPT](https://github.com/sunnweiwei/RankGPT) and [RankLLM](https://arxiv.org/abs/2505.19284): LLM reranking is a second stage over bounded retrieved candidates. Use stable passage identities and strict JSON validation, with explicit failures rather than silently treating malformed rankings as valid. We choose a small listwise window, not an LLM call per corpus document.
- [LightRAG](https://github.com/HKUDS/LightRAG): combine entity/relation retrieval and original passages, retain document provenance, and update affected records incrementally. Reimplement the relevant ideas in the existing TypeScript/vault architecture, without importing its Python server.
- [GraphRAG methods](https://microsoft.github.io/graphrag/index/methods/): semantic extraction has real model cost; co-occurrence is cheaper but does not establish a factual relationship. Do not label co-occurrence as a supported fact. No whole-corpus community report rebuild on every edit.
- [ALCE](https://arxiv.org/abs/2305.14627) and [verifiability](https://arxiv.org/abs/2304.09848): citation coverage and support are separate evaluation targets. A model's verification judgment is not proof of real-world truth. Distinguish supported, contradicted, mixed and insufficient evidence.

## Current architecture and compatibility

Positive IDs use the original desktop SQLite backend. Negative IDs identify encrypted portable collections, already available on Android. Portable collections currently reuse SessionRagEngine: authenticated encrypted vector shards, SHA-256 source checks, local parsers, optional OCR and native multimodal input. Their current operational limits are 2,000 documents, 20,000 chunks and 10 MiB/source; these must remain visible until measured alternatives justify raising them. No claim of unbounded scale.

The augmentation layer uses the existing authenticated vault and opaque collection namespace. Each collection owns its vector, derivative, metadata and graph generation. No plaintext graph/vector copy. Collection protection, access scopes, storage relocation and explicit provider consent cover derived data too. Global STT already exists; use that selection with a separate indexing opt-in.

## Data model

Stable source identity is collection ID + file ID. A source revision uses SHA-256 of bytes. Each derivative records source hash, parser/OCR/STT configuration fingerprint and coverage. OCR/transcripts are retained for non-text sources; keeping normalized Markdown for text documents is optional. Never silently replace the original.

Each document owns a bounded extracted record: summary, open-schema key/value tags, entities (name + type + aliases), and directed subject/predicate/object relations. Every entity/tag/relation has an exact evidence quote and source offsets. Entities and predicates are not restricted to a predeclared business taxonomy. Do not invent reverse triples; inverse navigation can traverse incoming edges without asserting another fact. Same-name entities with incompatible types are not automatically merged.

Analysis cache identity includes content, parser settings, extraction model, prompt/schema version and limits. A bounded per-text-window extraction avoids silently dropping the middle of large documents; aggregate locally and report partial coverage. Generated summaries are derived interpretations, not independent sources. Their search hits lead back to original supporting excerpts.

Commit new immutable records before publishing a manifest revision; retain the old manifest on cancellation/network errors. Changed/deleted documents invalidate their own relations, postings and vectors. Crash leftovers are collected by ownership, never by broad filename deletion. No LLM reanalysis for unchanged records. Changes to credentials/endpoint/model abort in-flight protected operations.

## Retrieval and federation

Keep stores per collection, attach authorized handles at query time. Apply unlock checks before discovery, reads and network calls, and after awaited operations. Never merge embeddings from different models/dimensions in a common similarity space. Retrieve independently, then fuse ranks with reciprocal-rank fusion (RRF). Scores are retrieval ranks, not factual confidence.

Candidate lanes: vector similarity; bounded lexical terms; exact typed entity/tag filters; one/two-hop relation traversal. Listing all clients uses paginated structured enumeration, not top-K similarity. Results report scanned pages, continuation and incomplete coverage. Open-world types may be multilingual: support exact filters and discover the available keys/types before querying; no arbitrary hidden translation/alias merges.

Optional Virtual reranking with LLM sees only the bounded candidates and query, no tools/web/execution. Prefer a small explicitly selected model, temperature zero, validated JSON indices and relevance scores. Never change or fabricate source text. Missing candidates retain retrieval order; duplicates, foreign IDs, non-finite scores and over-budget responses fail. No automatic paid retries or implicit provider fallback.

## Chat and citations

Keep native knowledge_base search/read/list. Additional optional tools discover metadata keys/entity types, enumerate entities, traverse relations, retrieve source excerpts and request verification. Attach only tools for the selected authorized collections. A request-local evidence ledger owns citation IDs; the model cannot register an arbitrary local path as evidence.

Citation payload: source kind (collection/external/model), collection/file ID, source SHA-256, derivative revision, exact start/end offsets, page/line/time where available. Display clickable compact references. A modal shows highlighted excerpt with preceding/following context, then bounded expand/paging and Open document. Prefer native viewer with page/search/time anchors; otherwise show parsed text. A source changed after the answer must be labelled changed; never silently show a new paragraph as the old proof. Reauthenticate protected collections on click. Avoid serializing protected source bodies into global UI caches.

External references carry only actual URLs returned by search tools, with origin label and retrieval time. Model is an explicit provenance label, not a verified citation. Never mark unsupported internal knowledge as source-confirmed. Preserve existing web/reference rendering when the new mode is disabled.

## Fact checking and publication gate

Expose a bounded verification tool using the globally configured verifier or an explicit collection/session override. Inputs are the draft claims plus request-local evidence IDs; no arbitrary hidden file or web access. Validate each claim against the cited exact excerpts. The checker returns supported/contradicted/mixed/insufficient, a short rationale and supporting/conflicting evidence IDs. Verify quotes/IDs locally; do not trust a checker-generated green badge on its own.

When session fact checking is enabled, buffer the assistant's draft answer text before publication (thinking/tool UI can retain normal progress). First verification -> optional bounded revision by the answer model -> second verification of the ACTUAL final text. At most one revision, strict token/latency budgets, cancellation and visible status. On unavailable checker or unresolved claims, ask/return a clearly unverified result according to explicit policy; never flash an unverified draft as approved. Tool-call messages needed by the model remain causal and intact. Mobile worker, desktop, shared chat, external MCP conversation runner and resumed agent paths need parity tests before declaring this complete.

Badges and details attach to exact claim spans in final text, not a single global score. The UI stores structured verification evidence alongside the message; it does not infer green status by parsing arbitrary model emoji. External and Model-origin claims remain distinguishable. Verification requires source retention/consent and may use additional provider credits.

## Linked folders and updates

Reuse the existing secure folder-grant machinery, with an explicit collection-scoped read-only capability (not a fake chat authorization). Keep content and collection binding/name in the encrypted collection manifest; the native platform stores its local OS directory grant mapping. External originals retain their own device protection. Reject symlink escapes, changing bindings, oversized files and unavailable SD/directories. Manual refresh and debounced bounded scanning compare SHA-256; modified time is only a scheduling hint. Do not recursively watch or reindex every file on each render. Pause on app lock/background; resume explicitly where provider work may cost credits. Deleted paths remove their source-derived records after an atomic refresh. Backups clearly distinguish original uploaded files from linked sources and never silently transfer OS grants to another device.

## Graph UI

Render only a bounded selected subgraph, not thousands of DOM nodes. Search by names/type/tags, filter relation direction, click an edge to open its evidence, paginate expansion. 2D pan/zoom, touch gestures and accessible equivalent entity/edge lists. Cancel stale searches and clear decrypted data on lock. Start with deterministic bounded layout; add force layout in a worker only if benchmarks justify it. No animation loop while idle.

## Delivery sequence and acceptance

1. **First vertical slice:** project record; optional validated LLM reranking with global/collection selection and mobile-safe UI; deterministic test fixtures. Independent advanced metadata engine and synthetic scale benchmark with strict source grounding, cache invalidation and bounded reads.
2. Integrate metadata/derivatives transactionally with indexing, optional OCR/STT alongside native embeddings, summary retrieval and paginated hybrid/structured tools. Add reindex action and regression tests for untouched existing collections.
3. Citation evidence ledger, excerpt/viewer modal, federation and bounded graph explorer; linked read-only directory grants and incremental refresh.
4. Configurable verifier tools, structured claim verdict UI and pre-publication gate across every generation path. Preserve native tool loops, E2EE/MCP semantics and existing messages.
5. Measure 1k/2k-document indexing updates, zero-change provider calls, query I/O/memory and cancellation. Synthetic PDF/Office/Markdown/code/OCR/audio fixtures and conflicting sources. Publish only completed, tested capabilities; keep unfinished features gated or unexposed.

## Performance and privacy criteria

One document/window in memory during extraction, bounded candidate windows, serial background indexing by default, cooperative yields and abort checks. No graph-wide LLM work during ordinary search. Cache unchanged source revisions. Derived text/graph share source protection and backup/cleanup policies. No new runtime dependencies or workstation build installs. Record benchmark machine and fixture size; simulated-model timing cannot establish real provider speed or factual accuracy. Real model probes require an active authorized test key and a stated cost cap.

## Live diagnostics — 13 November 2026

The optional Actions-built driver was run locally with a temporary runtime-only Venice credential and synthetic documents. Private Qwen3 Embedding 8B returned 4096-dimensional vectors. Semantic and hybrid retrieval each ranked the expected document first for six small fixture questions; this does not establish large-corpus retrieval quality. Private Mistral Small extracted source-anchored project/client metadata and correctly reranked the conflicting policy candidates. The first extraction exposed pronoun-only relation quotes; the extraction instruction now requires a contiguous span containing both endpoint names, unsupported edges are excluded with warnings, and the second real run completed with zero omitted edges.

A separate Nemotron multimodal probe failed with HTTP 400 because the Venice endpoint rejected the documented NVIDIA modality/input_type parameters. A multimodal model label alone is not treated as proof that the Venice transport supports image embeddings. Existing supported native multimodal adapters remain independent from OCR/STT opt-ins.

Citations persist encrypted, exact source-revision receipts with adjacent context. Source replacement leaves historical excerpts visibly stale; source deletion removes its receipts. The graph computes one bounded deterministic layout (150 nodes/300 edges) and retains at most 48 response rows, without an animation loop. None of these provenance indicators is an answer-verification verdict.

## Incremental updates and transport follow-up

Normal indexing updates only source revisions that changed. Removing a source prunes its vectors, metadata, derivatives and citation receipts without inference calls. Within a changed text document, exact passage hashes reuse existing embeddings from the same file/settings; only novel inputs are embedded, with duplicate inputs collapsed. Cache maps retain hashes/shard addresses rather than every old vector. Reused chunks receive the new source hash and current line/page locations. Metadata extraction reuses exact window hashes and shifts verified quote anchors to their new positions. If raw container bytes change but parsed text is identical, its analysis is rebound to the new source revision without another extraction call. Changed chunk/window boundaries can require adjacent inputs to be recomputed; reuse is conservative, never approximate. Explicit Reindex bypasses old caches. Optional index counters report new embeddings, reused passages and unchanged files.

The catalog also offered anonymized Gemini Embedding 2 Preview. A live text control returned3072dimensions. Both structured-image formats were rejected400. Raw PNG dataURL strings returned200, but so did an invalid PNG string; a four-way synthetic text-to-image test achieved only2/4Recall@1. These observations do not establish native media support and suggest serialized input may be treated as text. The Venice adapter therefore continues to accept text only. This limitation follows the [published Venice string/string-array schema](https://docs.venice.ai/api-reference/endpoint/embeddings/generate); it is separate from [native multimodal Gemini embedContent](https://ai.google.dev/gemini-api/docs/embeddings).

Further evaluation should separate retriever recall, answer grounding, completeness and source-support accuracy, following [RAGChecker](https://arxiv.org/abs/2408.08067) and [RAGBench/TRACe](https://arxiv.org/abs/2407.11005). A verifier model is an imperfect evaluator; matching source quotations alone cannot establish real-world truth.

## Source and provider cache bindings

Uploaded files now bind their verified SHA256 digest to the immutable encrypted asset identity in the encrypted collection manifest. Revision checks compare this binding; legacy/unbound or replaced aliases fall back to reading and hashing actual bytes. This optimizes revision discovery, not continuous bit-rot checking: authenticated ciphertext is still verified when read. Bulk uploads stage individual encrypted source assets and publish one manifest. Operation-local collection snapshots are keyed by the immutable manifest asset identity and access is rechecked after awaits.

Vector indices additionally record a non-secret embedding-space hash covering the provider/type/endpoint/model/dimensions/transport and any explicitly declared model revision. Credentials are excluded. An endpoint/space change with the same configured model requires explicit Reindex before further provider requests; credential rotation does not. Legacy indices without this binding need a one-time explicit rebuild. Silent model-weight changes behind an unchanged remote alias remain undetectable without a declared revision.

Search results carry their ordinal within the indexed file, so candidate materialization reads only selected vector shards instead of performing another full scan by UUID. The initial exact semantic/hybrid scan remains linear; no ANN speedup is claimed. A new1000-document encrypted-vault benchmark is being validated, with deterministic256-dimensional vectors and model-free extraction. It measures software/crypto paths using fake-indexeddb and in-memory cipher blobs, not physical storage or Android performance.

The shared source-support verifier and scoped desktop MCP adapter are experimental. They bind exact claim substrings locally, validate source IDs and verbatim supporting quotations, expose conflicting/missing support, and optionally perform one conflict correction followed by verification of the actual final text. At most three model calls are allowed. A95% character-coverage threshold is a heuristic, not proof that all factual claims were checked. Source revisions, permissions and provider bindings are revalidated after asynchronous calls. These components are now integrated behind explicit settings: the primary-chat publication projection, scoped nonstream conversation helper, clickable citation verdicts/report modal, actual tool-result ledger and read-only linked collection refresh. Source support is not real-world truth. External web evidence is a tool snapshot, not a fresh webpage verification; legacy collections/native search without excerpts remain unverified. Auxiliary calls and implicit external worker reviews are excluded. The current final regression run remains pending.

## Release integration — 14 November 2026

New linked-directory refresh stages only changed encrypted sources and atomically swaps the source manifest before derived indexing; missing/incomplete scans cannot delete the last snapshot. Hashes, not timestamps, decide reuse. Source directories are read-only on desktop and Android SAF; the external source itself is not encrypted. Background monitoring is explicit, visible-app only and pauses after errors. Backup restore omits OS grants.

Android Work now registers selected global knowledge/federation tools during initial preparation and tool resumption. Optional per-chat source review adds an explicit intermediate knowledge_verify tool bound to selected receipts and owner authentication. The final-publication gate remains independent. Three judge/revise/recheck calls are the limit per review invocation, not the total generation budget. All privacy/provider consent remains explicit.

The current native Chromium/IndexedDB four-case paired benchmark covers1,000 short one-chunk documents at1024/4096dimensions, actual AES-GCM and deterministic models. Compact float32 payloads are62.8%/71.7%smaller; query observations are1.470/1.674seconds versus2.680/3.457seconds for the same-run array-writer controls. One fixed-order observation per case is insufficient for statistical superiority; the runner differs from earlier measurements. Unchanged indexing made0modelcalls; one-document update made1embeddinginput+1analysiscall. The initial scan is still linear.
