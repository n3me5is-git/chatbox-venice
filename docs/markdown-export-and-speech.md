# Markdown export and on-demand chat speech

## Text editor and previews

Open **Files and resources** in a chat. Managed text files and writable legacy Work files have **Edit file** and **Save file**. Text attachments and other read-only resources offer **Edit a copy**: saving creates a managed file under `edits/` and preserves the source. Markdown, source code, JSON, CSV and other recognized text formats use the text editor, with the existing 2 MiB preview/edit bound.

The explorer previews Markdown, text, HTML, images, audio and video. Desktop also delegates PDF viewing to its native browser viewer. No Office viewer or cloud document conversion was added; unsupported documents keep the existing export/open-in-another-app flow.

## Export the rendered Markdown

In the rendered Markdown preview, choose **Export PDF** or **Export single-file HTML**. The original **Export** control still exports the source `.md` file.

HTML captures the rendered document, table of contents, heading links, tables, formula layout, images and Mermaid diagrams. Images and KaTeX fonts are embedded as data URLs. Mermaid is a static SVG image, so the exported file requires no Mermaid JavaScript, app bridge, CDN or network connection. Remote Markdown images remain subject to the preview's explicit opt-in; export does not enable them automatically. A failed asset download fails the export rather than creating a file that falsely claims to be self-contained.

Links to websites remain links. Safe relative links to other session documents remain relative links; their target files are not bundled into this single document and must be exported separately. Embedded preview assets are bounded to 64 images, 2 MiB each and 20 MiB total, with a 32 MiB HTML limit. Exports use a light document theme and A4 print styling.

- **Windows:** the isolated local Chromium PDF renderer generates a PDF, then the app opens its existing streaming save flow. The renderer has no scripts, provider credentials or app bridge, and blocks network requests.
- **Android:** a separate offline WebView opens the Android print sheet. Choose **Save as PDF** and the destination. JavaScript, native file access and network loading are disabled in that print view.
- **Browser:** the browser print dialog provides the PDF destination where supported.

Exports are ordinary readable files in the chosen location, outside the encrypted workspace/backup. Protect or delete those copies separately.

## Configure global speech models

Open **Settings → Default models → Speech recognition & speech synthesis**. Choose recognition and synthesis models independently. No paid model is chosen automatically and there is no fallback to another provider.

The supported direct audio contract is OpenAI-compatible `/audio/transcriptions` and `/audio/speech`, with Venice, OpenAI, Groq and custom OpenAI-compatible provider configurations. A provider must actually implement the selected endpoint/model. OAuth-only chat credentials, Azure deployment-specific authentication and queued Venice music/speech models are not routed through these direct speech controls. Use Studio for queued media workflows.

Use **Load speech models** to fetch the provider catalog. Venice returns the model's privacy metadata, available voices, formats and pricing. The voice selector uses readable names; the model card shows the existing detailed model information. Advanced fields allow a custom model or voice ID. For Venice, enable the provider's Audio/transcription module as well. Credentials remain in the provider configuration.

Catalog privacy claims are bound to the provider endpoint and API key with a fingerprint, not a duplicate stored key. Changing the endpoint/key requires reloading the catalog. An unknown model is treated as having no private claim. Catalog loading does not generate audio or consume an inference call. Models/categories are separated: chat, music and queued advanced speech models do not appear as direct ASR/TTS models.

## Dictate a draft

Use the microphone beside the chat input. Record locally, stop, then choose **Transcribe into draft**. Recognition receives only that recording and optional language selection. Its text is appended to the current draft, preserving existing text. It never sends the chat prompt automatically.

Recording retains the existing three-minute/25 MiB bound and format adaptation. No upload occurs before the explicit transcription action. Closing the dialog, changing the speech/chat privacy configuration, backgrounding or locking stops recording and cancels pending work. Microphone permission is still required on the device.

## Read a reply

Use **Read aloud** in an assistant message's action row. The global synthesis model receives that reply's readable text, without implicitly sending the whole chat, thinking content or tool arguments. Code blocks, raw HTML and image nodes are omitted. The player opens only on an explicit action; provider charges may apply.

The request supports up to 20,000 characters and bounds the audio response to 20 MiB. It selects a playable format offered by the model instead of assuming raw PCM is playable. Audio is transient, not automatically added to the library. Closing the player, backgrounding, changing relevant configuration or locking stops playback and releases its object URL. Starting another speech action stops the previous one. Errors do not automatically repeat paid requests.

## Privacy gates

| Chat | Speech model | Result |
| --- | --- | --- |
| Ordinary | Configured compatible model | Explicit on-demand request. |
| Private / TEE | Declared private | Allowed over HTTPS. |
| Private / TEE | Anonymous, non-private or unknown | Disabled; tapping explains the reason. No recording upload or synthesis call. |
| E2EE, or an E2EE-capable selected chat model | Declared private | Warning and **Continue for this request** required each time. |
| E2EE | Anonymous, non-private or unknown | Disabled, with no bypass. |

The audio endpoints currently do not implement the text E2EE handshake. A catalog capability does not make an audio HTTP request end-to-end encrypted. The warning explicitly says that the recording or reply text is sent via HTTPS and that “private” is the provider's privacy claim. Consent applies only to the current action and is rechecked against model, key, endpoint, preferences, chat privacy and project access before sending/returning data.

Text-model E2EE, MCP calling, Studio generation approval and existing Work tools keep their existing behavior. This release adds on-demand speech controls, not an automatic continuous voice conversation.

## Validation

Actions cover privacy refusal before network access, per-request E2EE consent/cancellation, credential-bound metadata, changes during approval, payload/MIME/bounds, multipart recognition, editable draft insertion, player cleanup and native PDF isolation. Browser simulation uses the production speech controls and client with fake service responses, a real browser recorder driven by a synthetic microphone, and a real WAV decoder. It also reopens the exported HTML offline and prints the same document to an actual PDF for visual review. No real provider key or paid request is needed for these tests.
