# Knowledge collections on mobile

Open **Knowledge Base** from sidebar tools or Settings. The overview lists collections; **New collection** creates one and **Open folder collection** connects an existing portable collection. Search across unlocked collections lives on its own overview tab.

Opening a collection shows its documents first:

- **Add documents** imports source files. **Index now** explicitly updates their search index.
- **Read document** renders original PDFs and supported Office content locally. A document's action menu also opens extracted text, Markdown/image derivatives, passages, replacement and confirmed deletion.
- The document filter and previous/next page controls support long lists. Source names remain readable on narrow screens.
- The collection action menu contains protection, available graph tools, locking and index maintenance. Clearing an index keeps source files; removing a mounted collection keeps the external folder.

The **Search** tab searches indexed passages without hiding the document list below settings. The **Settings** tab groups the embedding model, document processing, optional knowledge extraction/reranking and storage. Settings drafts survive tab changes and document additions. Leaving unsaved settings requires confirmation.

Processing options remain explicit. Opening a collection or editing/saving its settings does not start inference or rebuild its index. Provider consent is still required, and model changes must be saved before indexing. Read-only mounts retain their source-write restrictions. Locked collections and their previews remain protected.

The shared mobile panels use larger touch controls, wrapping model labels and a single scrolling owner. Session RAG and agent forms group advanced controls; media-library filters allow both horizontal selection and normal page scrolling. Contextual action menus close before their parent when using Back.

## Chat collections and source review

The composer's **Knowledge Base** panel contains the primary collection, up to seven additional portable collections, and **Check answers against sources**. Session settings use the same editor. Collection choices and review consent also survive creation of a new chat. Typing **@** offers available portable collections: an explicit mention grants access for the current owner request without permanently attaching that collection. Protected content still requires its owner's unlock.

Source review asks the selected verifier to assess client-assigned statement IDs. The app maps these back to the exact answer and independently validates offsets, exact evidence quotations, coverage and the final answer hash. A partial review is distinct from a failed request. Individual statement badges identify admitted KB/online evidence or the absence of an independent source (Model). Conflicting assessments open both sides and the verifier's explanation. These are model assessments, not a guarantee of truth.

While **Checking sources** is active, expand **Checker reasoning** to see reasoning returned by the provider, when available. Concise/off reasoning modes may return none. The app does not manufacture a trace; retained traces are available in the review details. They follow the chat's local protection, independently of provider encryption/attestation.

Knowledge citations use compact source chips. Desktop hover reads already-authorized local excerpts and never opens an unlock prompt. Click to open a source, search its displayed or parsed text, and optionally open the original PDF at its cited page. PDF pages scroll continuously; PDF search uses embedded text, so scanned originals may need the extracted OCR view instead.

## Processing and document images

Desktop collections accept file drops while writable and idle. Creation/settings forms use more desktop width; **Use global model defaults** imports configured embedding, OCR, STT, reranker and extraction choices while keeping inference opt-in.

**Maximum parallel model requests** (1–8) is shared by OCR, embeddings and knowledge extraction within one indexing job. File producers are capped at two, OCR page producers at four, and source buffers have a separate 52 MiB accounting budget. Raster/parser memory is additional; the setting is not an application-wide provider rate limit. A rate-limit response stops queued requests without automatically retrying paid calls. Completion order does not change document/page ordering.

**Keep images with extracted Markdown** saves locally derived raster objects and graphical-page previews without extra model requests. Open **Extracted Markdown and assets** for page-scoped previews. Canonical citation text stays unchanged. Assets follow collection protection and portable-folder storage; explicit unencrypted folder collections remain unencrypted. Previews are bounded (96 assets, 50 graphical pages, 48 MiB per document, 3 MiB per image); the original remains authoritative. Existing text/vectors can be reused when adding or removing image retention. Portable-folder copies include derivatives; app-library backup restoration currently restores source documents and requires consent before rebuilding derived indexes.
# Retrieval recovery and review details

Query embeddings may retry one temporary upstream failure, using the same configured provider and model. The wait respects a short Retry-After (up to three seconds); HTTP 429 stops immediately. Indexing and generation requests do not inherit this policy. A temporary embedding outage can continue with local BM25 keyword matching. The result carries an explicit warning: semantic-only matches can be missing.

An optional reranker returning a temporary HTTP failure or timing out does not discard already retrieved passages. The original ordering and source identities are retained, with a visible warning in the search tool details and model output. A virtual LLM reranker is not automatically called again. Authentication, configuration changes, cancellation, privacy locking and invalid indexes remain blocking errors.

New chat reviews bind only the final answer after the last tool call; earlier narration remains in the work log. The report records `answerScope: final-answer-v1`. Earlier reports keep their original whole-text hash semantics. Checker traces remain report metadata and are projected into a separately labelled Thinking disclosure; they are never inserted into provider reasoning or subsequent request context.

Source-review dialogs render Markdown and LaTeX locally and offer verdict filters, text search and raw-text inspection. Quotes remain exact stored substrings regardless of display mode. Remote Markdown images, raw HTML and executable diagram content are disabled. Opening a source still requires the existing access checks.
