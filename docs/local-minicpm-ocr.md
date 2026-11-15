# Local MiniCPM OCR on desktop

MiniCPM-OCR is an optional local **OCR role**, available for global attachment recognition and knowledge collection/session OCR. Existing remote OCR selections remain unchanged. It is not registered as a general conversation model. Android and web do not run or download this native engine.

## Setup

In **Settings → Default models → Image text recognition (OCR)** choose **Set up local MiniCPM OCR**. The same setup is available from a collection's OCR model selector. Install Q4 for smaller weights or Q8 for higher precision. **Download model and required components** installs the chosen GGUF, the shared vision component and the native processing engine. Downloads occur only following an explicit installation action; inference never downloads missing components or falls back to a remote provider.

Alternatively import the matching official GGUF files. The main model and the F16 4× vision projector are both required. Import copies the file into the app's model storage and leaves the original unchanged. Only the pinned official artifacts are accepted; a similarly named or different quantization file is rejected if its size or SHA-256 differs. Q4 and Q8 share one projector.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| MiniCPM-OCR-1_0-Q4_K_M.gguf | 529106816 | c80a703400633f298cc2fddf6d493a541be36918c0801c0b1bf3f14c5703ce49 |
| MiniCPM-OCR-1_0-Q8_0.gguf | 811598432 | 791486a476bdacb48acb3f31aa3a18dbb5be87e723a4074bcd13a37d61c852e2 |
| mmproj-model-f16-4x.gguf | 901017536 | ceed82261b3b1380c3165f8b37c10117a50093be1362cbfeeb692fa036444682 |

The model revision is 0133ad8db635210441a55dcf421e25bfb9915142 in [the official Hugging Face repository](https://huggingface.co/openbmb/MiniCPM-OCR-1.0-gguf/tree/0133ad8db635210441a55dcf421e25bfb9915142). Weights are Apache-2.0. The app downloads pinned, SHA-256-verified [llama.cpp b11901](https://github.com/ggml-org/llama.cpp/releases/tag/b11901) runtime archives under MIT licensing. Automatic runtime packages currently cover **Windows x64 and Linux x64**, CPU or Vulkan; Ubuntu-built Linux packages need compatible system libraries. Other desktop architectures are explicitly unavailable in this version.

## CPU, GPU and memory

CPU is the default. Set the number of CPU threads and apply the processing settings. Vulkan is an optional backend for supported integrated or discrete GPUs with compatible drivers. The app checks for an enumerated Vulkan device before using it; it does not label an internal CPU fallback as GPU processing. A compatible device/driver does not guarantee sufficient graphics memory or acceleration of every operation. GPU processing is not benchmarked on the user's hardware.

The native process uses memory-mapped weights without mlock, bounded batches, one 8192-token context slot, no reusable prompt cache and a fixed OCR prompt with thinking disabled. Memory mapping permits the OS to reclaim file-backed pages; it does **not** guarantee that only a tiny part of the model is resident. Inference touches layers, and the vision component, KV context and temporary buffers add memory. Integrated GPUs share system RAM. Q4 plus the projector is about 1.43 GB on disk before runtime files; Q8 plus the projector is about 1.71 GB. These are not RAM estimates.

**Keep the model ready** defaults to 120 seconds after the queue becomes empty and supports 0–1800 seconds. New requests reset the timer. Already queued pages reuse the loaded process without an idle gap. **Release memory now**, app locking, renderer shutdown and application exit stop the owned process. After idle unload, the next request reloads it.

A single OCR job can use multiple CPU threads. Native requests run one at a time to avoid duplicating model and context memory. The main-process queue is capped at four requests and 48 MiB of encoded image strings; this bound excludes IPC copies, renderer pages and native working memory. Global attachment OCR dispatches locally one image at a time. Scanned PDFs prepare at most one next page while the previous page is recognized, retaining existing locally parsed text pages and checking cancellation.

## Privacy and operational boundaries

Recognition requests remain in a separate authenticated process bound to 127.0.0.1 on an ephemeral port. A per-process random key is held in an app-private temporary file and is removed when the process stops; it is not a provider credential. No document is written to a temporary image file or sent to Hugging Face/GitHub during inference. The app and existing collection/session protection decide where recognized text is retained. Public model weights are stored as ordinary files in the model storage path shown by the setup panel.

Downloads are streamed to a staging file and published only after size/hash checks, with bounded redirects to approved HTTPS download hosts. Failed/cancelled transfers are not installed. Runtime binaries come from the pinned runtime package, not the user's GGUF file. Imported data is never executed as a program. Use the setup panel to remove downloaded weights. The shared projector may be removed only after operations finish; collections retain their derived text until separately reindexed or cleaned.

This integration uses the official **Text Recognition:** prompt through llama.cpp's vision endpoint. It does not include the upstream learned layout detector, DSpark speculative decoding, semantic photo captions, Jev scoring or guaranteed table/formula reconstruction. Existing optional captions remain available through a separately selected vision provider; selecting this OCR disables that description option. Full upstream document benchmarks do not describe this narrower pipeline. Output stopped by a token limit is reported as incomplete rather than silently indexed as a successful extraction.

## Validation

The separate **Local OCR real inference** workflow is opt-in via workflow dispatch or the **local-ocr-live** pull-request label. It downloads public weights on GitHub runners, checks a synthetic Italian-text image over three queued requests, process reuse and idle release. Ordinary checks cover import/download integrity, URL boundaries, queues, cancellation, role routing, settings and localization. CI reports belong to workflow artifacts and development evidence, not release notes. No SDK or model installation is needed on the development computer.
