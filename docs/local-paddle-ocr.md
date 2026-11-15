# Local PaddleOCR

PaddleOCR is an optional local OCR choice on Windows x64 and Android. Open the global OCR model selector or a collection/session OCR selector, choose **Set up local PaddleOCR**, install the public model component and select **Use this OCR model**. Downloads are explicit; inference does not upload documents or require a provider key. MiniCPM and existing provider OCR choices remain available.

The native component uses ncnn with the pinned PP-OCRv5 mobile detector and Latin recognizer (Italian and English included). The recognizer has 838 CTC classes including blank and space. Both CPU and Vulkan use the same float32 weights. This is text recognition with geometric reading order, **not PP-StructureV3**: it does not reconstruct table cells, formulas or visual descriptions. Handwriting and complex layouts require source review; synthetic examples do not establish general handwriting accuracy.

CPU is the default. GPU acceleration requires compatible Vulkan drivers and can be slower on an older integrated GPU; the first GPU load also compiles shaders. Threads and the keep-ready timeout are adjustable. Consecutive pages reuse the loaded weights; the idle timer starts after the queue drains and resets for a new request. Queue size and total input bytes are bounded, and requests can be cancelled. Locking the app releases the local OCR worker. Windows uses a private stdio process; Android uses an in-process native library. Neither exposes an inference HTTP port.

Windows downloads a verified engine/model ZIP of approximately 20.4 MB or imports the exact matching package. Android includes native libraries for supported ABIs in the APK and explicitly downloads approximately 11.8 MB of models. Actual installed sizes exceed compressed download sizes. Installation verifies the pinned archive and manifest hashes; model files are checked before loading. Downloaded model files can be removed from the setup panel. Component source provenance and complete third-party license notices travel with the packages.

## OCR every PDF page

Session and collection RAG retain their previous default: parse embedded PDF text and apply enabled OCR to scanned/missing-text pages. **Read all PDF pages with OCR** instead replaces embedded text with the selected OCR result. This can help when the native text layer has incorrect reading order, but the chosen OCR model still determines quality. Each page is processed, page references remain attached and an OCR error is surfaced instead of falling back to the damaged text layer. Existing page/size safeguards still apply.

Changing this policy invalidates affected PDF representations. Matching text chunks can reuse embeddings within the same verified embedding space. The option does not activate unless OCR is enabled and requires the normal indexing consent. See [the advanced knowledge guide](advanced-knowledge-guide.md) and [portable derived-text storage](portable-knowledge-v1.md#retained-derived-text-compression).
