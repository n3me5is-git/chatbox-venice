# Changelog — Chatbox Venice

## 1.55.0

- Optionally share links to matching original files in connected knowledge collections through desktop MCP.
- Set, regenerate or securely remember a desktop MCP bearer token independently of automatic startup.
- Optionally run a loopback-only MCP endpoint without a bearer token.
- Keep MCP endpoints connected while switching views and accessing protected projects or collections.
- Wait for Studio images through MCP, return available provider error details and preserve the original download format.

## 1.54.0

- Automatically restart selected desktop MCP endpoints with a stable port and device-encrypted token.
- Keep selected MCP endpoints connected through app lock, with preapproved text routing for model routers.
- Manage single-chat sharing from the chat’s MCP menu and stop active shares from global settings.

## 1.53.0

- Start a temporary chat that stays off the sidebar and survives app lock.
- Save a temporary chat permanently or set it to expire after a chosen period.
- Clean up conversations, workspaces and generated files while preserving linked project folders.

## 1.52.1

- Recover temporary knowledge-search failures without losing retrieved passages, and explain reduced ranking.
- Review the final answer separately from work narration and improve source matching for paraphrases, headings and formulas.
- Render Markdown and mathematics in source-review dialogs, with search, filters and raw-text inspection.
- Keep provider-returned checker reasoning in the answer thinking timeline.

## 1.52.0

- Unify chat collections, source review and contextual @ mentions.
- Improve statement-level source assessments, conflict details and checker reasoning visibility.
- Add compact source chips, desktop hover previews and source-text search.
- Scroll PDFs continuously with local text search.
- Retain and browse document image derivatives alongside extracted Markdown.
- Add desktop document drops, wider collection forms and global model defaults.
- Bound concurrent indexing requests across parallel pages and files.

## 1.51.0

- Render original PDFs locally in chat files, shared files and knowledge collections, with page and zoom controls.
- Add local read-only Office content previews while retaining text editing and rendered Markdown exports.
- Fix mobile collection actions and improve narrow-screen feature panels.
- Show indexing phases, pages, document readiness, elapsed time and tracked usage estimates.
- Continue Android indexing in the background, and resume completed vector and metadata work after model failures.
- Apply concise processing settings to actual OCR and knowledge-model requests; explain encrypted Vision transport limits.

## 1.50.0

- Open knowledge collections in dedicated Documents, Search and Settings views, with direct access from sidebar tools.
- Improve mobile document actions, pagination, settings drafts and advanced processing controls.
- Make new feature panels easier to use with touch, narrow screens and on-screen keyboards.
- Simplify agent and session RAG forms, library gestures and contextual-menu back navigation.

## 1.49.1

- Support knowledge-collection sources up to 50 MB across uploads, linked folders, replacement and backup/restore.
- Stream source ingestion and use bounded, hash-verified native folder reads.
- Use a dedicated binary document parser while retaining resource and execution limits.
- Update English and Italian file-limit guidance.

## 1.49.0

- Virtual OCR selection for any configured Vision model, including custom providers.
- Optional local-to-vision OCR fallback for empty text, handwriting and complex pages.
- Explicit fallback provider selection, cancellation protection and processing provenance.
- Updated English and Italian OCR controls on desktop and Android.

## 1.48.0

- Optional local PaddleOCR on Windows and Android with CPU/Vulkan controls.
- All-page PDF OCR with incremental cache reuse and preserved page references.
- Compressed retained document text and portable-reader compatibility.
- Improved OCR reading order, camera orientation and local WebP handling.

## 1.47.0

- Optional managed desktop MiniCPM OCR with verified downloads/imports, CPU/Vulkan controls and queue-aware memory reuse.
- Global and per-collection OCR selection, bounded PDF prefetch and English/Italian setup controls.

## 1.46.0

- Optional public folder collections and automatic existing-folder setup.
- Searchable visual descriptions, source metadata and filename retrieval.
- Role-local concise OCR/source review and custom local embeddings without dummy credentials.

## 1.45.0

See [release notes](docs/releases/v1.45.0.md). Adds self-contained encrypted folder collections, transferable indexed data, federated graph exploration, query embedding reuse and a documented integration format.

## 1.44.0

See [release notes](docs/releases/v1.44.0.md). Adds optional encrypted hybrid knowledge retrieval, source review, collection federation, linked source folders and scoped MCP access; restores Android Work knowledge tools and preserves reasoning replay during approvals.

## 1.43.4

See [release notes](docs/releases/v1.43.4.md). Adds independent desktop MCP permission profiles and local routing, improves agent completion and resumption, surfaces Venice privacy verification and model details, and preserves advanced generation options.

## 1.43.3

See [release notes](docs/releases/v1.43.3.md). Adapts upstream reliability improvements to fork MCP routing, tool continuations and mobile networking, prevents duplicate retries, and adds model-aware Studio controls.

## 1.43.2

See [release notes](docs/releases/v1.43.2.md). Adds explicit image-reference model controls and capability badges, preserves manual selections, and requires an explicit choice when a compatible variant changes or does not declare its privacy or protection level.

## 1.43.1

See [release notes](docs/releases/v1.43.1.md). Fixes image-reference variant selection, reuses local library images after a SHA-256 check, and adds insertion actions at both ends of the media picker. Extends multiple-reference requests for OpenAI Sub Unofficial.

## 1.43.0

See [release notes](docs/releases/v1.43.0.md). Moves the encrypted archive between internal storage and a removable SD card on Android or a selected folder on desktop, with verified migration and explicit recovery when storage is missing.

## 1.42.0

See [release notes](docs/releases/v1.42.0.md). Adds encrypted global knowledge collections on Android and desktop, with collection-specific access controls and shared RAG parsing.

## 1.41.1

See [release notes](docs/releases/v1.41.1.md). Keeps derived RAG caches local to the session owner, rejects cross-scope protected sources, and blocks raw index access from general file/execution/agent transfer tools.

## 1.41.0

See [release notes](docs/releases/v1.41.0.md). Adds opt-in session RAG with encrypted local vector shards, semantic search and source citations, and optional device-folder workspaces on desktop and Android. Routes child-agent image approvals through their root collaboration session.

## 1.40.1

See [release notes](docs/releases/v1.40.1.md). Full-width chat model names, separate capability and price rows, and a collapsible sidebar tools group with a saved preference. Restores Android registration of shared Work tools, subscription images and multi-agent delegation, including resumed calls.

## 1.40.0

See [release notes](docs/releases/v1.40.0.md). Full remote chat sessions, inline @ references, subscription chat image tools, native search history repair, per-chat Venice tool scope and a bounded mobile image picker with provider groups.

## 1.39.1

See [release notes](docs/releases/v1.39.1.md). Keeps UI-selected thinking levels for custom subscription model IDs without requiring internal SDK flags. Includes the 1.39.0 login, model, search and context improvements.

## 1.39.0

See [release notes](docs/releases/v1.39.0.md). Repairs external-browser subscription login, refreshes Codex models, adds explicit custom endpoints and native web search, and makes thinking/context budgets configurable without changing other providers.

## 1.38.0

See [release notes](docs/releases/v1.38.0.md). Adds encrypted direct device transfers with complete child-agent/file/media trees, SHA-256 reuse and recoverable imports. Shows account-reported ChatGPT subscription allowances with tappable reset-date details.

## 1.37.0

See [release notes](docs/releases/v1.37.0.md). Adds guarded Work agents with shared or isolated sandboxes, an optional desktop MCP multi-agent tool group, device-local ChatGPT subscription providers and optional background collaboration controls.

## 1.36.0

See [release notes](docs/releases/v1.36.0.md). Adds bounded waiting for existing Venice media jobs and local audio/video artifact cards in chat. Recall saved results without another paid request and open them with the shared explorer viewer.

## 1.35.1

See [release notes](docs/releases/v1.35.1.md). Adds live local camera QR scanning alongside image upload, readable collaborative transport errors, pairing timeouts/retry and optional TURN configuration. Includes real direct/relayed WebRTC and Android camera/data-channel runtime checks.

## 1.35.0

See [release notes](docs/releases/v1.35.0.md). Adds encrypted peer chat sharing, participant permissions, three shared HITL policies and streamed file cloning. Repairs stale Venice image classifications, reviews all 405 catalog entries, shows model costs and exposes safe provider failure reasons directly.

## 1.34.1

See [release notes](docs/releases/v1.34.1.md). Adds independent separate engines in global Web Search settings and agent questions. Fixes new-chat dictation, Android microphone permissions, live file-explorer revision conflicts, recovery/preview of saved images, and repeated generation approval after failure.

## 1.34.0

See [release notes](docs/releases/v1.34.0.md). Adds PDF and self-contained HTML export from rendered Markdown, editable copies of text attachments, global speech-recognition/synthesis models, microphone-to-draft dictation and on-demand reply reading. Private chats block non-private speech; E2EE chats require per-request consent for private speech over HTTPS.

## 1.33.0

See [release notes](docs/releases/v1.33.0.md). Adds a per-chat resource explorer, rich local Markdown previews, encrypted managed files and workspace backups, isolated JavaScript and optional Python, and a permission-scoped desktop MCP server. Intermediate files stay out of the library unless marked as deliverables.

## 1.32.2

See [release notes](docs/releases/v1.32.2.md). Repairs encrypted MCP calls with backend-safe protocol tags, GLM XML parsing and a verified text bridge for native-mode gateways. Adds NEAR model-prefixed signatures with attestation/model binding and preserves the selected receipt policy, schema validation and permissions.

## 1.32.1

See [release notes](docs/releases/v1.32.1.md). Encrypts non-empty native tool-result text in E2EE chats while preserving the required public function-call metadata. Updates English/Italian consent and adds encrypted native tool round-trip coverage.

## 1.32.0

See [release notes](docs/releases/v1.32.0.md). Adds explicit chat-level Venice transport privacy, receipt policy and encrypted-tool settings with provider inheritance, downgrade confirmation and incompatible-model feedback. Clarifies the remaining live receipt-binding and model-attestation limits.

## 1.31.0

See [release notes](docs/releases/v1.31.0.md). Adds local reference cropping, Venice background removal/upscaling with protected local outputs, explicit model prices and video quotes. Repairs Phala/NEAR AI quote transport padding and adds opt-in compatible gateway receipt verification after live E2EE investigation.

## 1.30.0

See [release notes](docs/releases/v1.30.0.md). Adds opt-in encrypted tool conversations using the attributed venice-e2ee text protocol, optional native tool metadata with explicit consent, independent chat search switches, three named Venice search engines and bounded search retries. Preserves new-chat profiles and refreshes Work/MCP capabilities immediately.

## 1.29.0

See [release notes](docs/releases/v1.29.0.md). Repairs Android biometric cipher ordering, inference-key balances, touch panels, model selection, independent search controls and protected previews. Adds the sidebar visual library and complete English/Italian fork strings.

## 1.28.1

See [release notes](docs/releases/v1.28.1.md). Fixes dedicated project PIN selection when unlocking image history, clears PIN input between protected areas and preserves brush drags inside the mobile image editor.

## 1.28.0

See [release notes](docs/releases/v1.28.0.md). Adds encrypted media storage and portable library backup, lazy media/transcript previews and streaming native export, direct chat deletion, independent PIN/device unlock, project access controls, Venice text TEE/E2EE and privacy filters, voice cloning/conversion, local-library attachments, and model-aware image editing with local masks and percent comment points.

## 1.27.0

See [release notes](docs/releases/v1.27.0.md). Adds per-chat ask/similar/automatic generation approval, reusable per-call image parameters, visible revocation, English release sources and i18n-compatible fork UI with English fallback.

## 1.26.0

See [release notes](docs/releases/v1.26.0.md). Fixes model profiles and Venice thinking, adds global Venice search, model-aware music/video, native MCP image tools with model selection and per-call HITL approval, Studio images, microphone transcription, credit display and Venice embeddings for RAG.

## 1.25.0

See [release notes](docs/releases/v1.25.0.md). Adds optional Venice audio/transcription, video and music Studio, local media management, scoped Work Mode tools, reusable profiles, a provider switch, simulated browser/UI checks and personal Android release signing.

## 1.24.2

See [release notes](docs/releases/v1.24.2.md). Preserves local/text-only parser settings when importing legacy data, adds hydration/import regression checks and makes artifact uploads safe to rerun.

## 1.24.1

See [release notes](docs/releases/v1.24.1.md). Includes per-model vendor JSON, the Venice provider, native search, native image generation/editing, local history and deletion, and automated Windows x64 / Android builds.

Upstream base: Chatbox Community Edition 1.24.0, commit d17455c5ca8fd3ff44385c6d4d2118599e4c970f.
