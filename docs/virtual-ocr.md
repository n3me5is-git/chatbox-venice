# Vision models as OCR

Global Settings → Default models → OCR and the session/collection RAG media panel accept **configured models with Vision whose provider transport supports image inputs**. This includes general vision models, custom providers and local vision servers; the model does not need an OCR-specific name. Enable Vision in a custom model's provider configuration, then select it as the OCR role. Runtime capability validation rejects text-only targets.

The existing encrypted Venice adapter remains text-only and rejects image attachments, even when an encrypted variant advertises Vision in the provider catalog. It does not silently fall back to plaintext. Vision OCR currently requires a transport that accepts images, such as a standard Private Venice vision endpoint. Private and E2EE are different guarantees; the live OCR diagnostic did not test encrypted image inference.

Vision OCR asks for a faithful transcription, preserving language, spelling, numbers and reading order, with `[illegible]` for unreadable text. It does not ask the model to repair or summarize a source. Image instructions are treated as untrusted data; search and tools are disabled. Like other generative extraction, transcription can still be wrong and should be checked against the original.

## Optional vision fallback for local OCR

When PaddleOCR or MiniCPM OCR is selected, an independent vision role can be configured:

- **Off — local OCR only** (default): no vision provider is invoked.
- **When local OCR finds no text**: a successful but blank local result invokes the explicitly selected vision model once. This does not detect incorrect but nonempty text.
- **Always use vision (handwriting or complex pages)**: sends each OCR image/page directly to the selected vision model, avoiding unnecessary local inference. Use this for a known handwritten collection or difficult document layout.

Local OCR has no reliable handwriting/document-type classifier. Recognition confidence is not a calibrated measure of transcription accuracy. We therefore do not claim that empty-text recovery automatically detects handwriting. Engine failures, unavailable installations, permission errors and cancellation propagate; they never silently change the processing provider.

The fallback has its own provider and model, independent of the conversation's model. Enabling it may send document pixels to that provider. A local custom vision server can also be selected. Venice's Private, Anonymous and encrypted variants are different privacy levels; select the intended variant explicitly. A private conversation does not automatically make an unrelated OCR service private.

RAG processing requires the existing device-local collection/session provider consent. Changes to an active fallback invalidate parsing caches and index extraction fingerprints while permitting identical chunks to reuse vectors within a verified embedding space. Inactive fallback settings preserve existing fingerprints. Processing authority includes fallback provider configuration, and a fallback-used warning records the provider/model. Portable collection processing roles describe the fallback without credentials.

For a PDF whose embedded text should also be replaced, enable **Read all PDF pages with OCR**. Otherwise the existing scanned-page policy remains in effect. The choice applies to the collection/session, rather than guessing the writing style per page.

The same controls and routing run on desktop and Android. Optional local engines retain their platform requirements.
