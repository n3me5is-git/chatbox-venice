# Advanced local knowledge collections

Status: implementation in progress. Existing encrypted and legacy collections keep their native behavior unless a feature is explicitly enabled. This document is the delivery map, not a statement that every item below has shipped.

First milestone is developed in [draft PR #19](https://github.com/n3me5is-git/chatbox-venice/pull/19): optional collection LLM reranking and explicit vector reindexing. The augmentation engine is an independently tested foundation, not yet connected to collection indexing, graph UI or answer fact checking. No new release is claimed by this project document.

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

Reuse the existing secure folder-grant machinery, with an explicit collection-scoped read-only capability (not a fake chat authorization). Store the path/handle only in encrypted app metadata. Reject symlink escapes, changing bindings, oversized files and unavailable SD/directories. Manual refresh and debounced bounded scanning compare SHA-256; modified time is only a scheduling hint. Do not recursively watch or reindex every file on each render. Pause on app lock/background; resume explicitly where provider work may cost credits. Deleted paths remove their source-derived records after an atomic refresh. Backups clearly distinguish original uploaded files from linked sources and never silently transfer OS grants to another device.

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
