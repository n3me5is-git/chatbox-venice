# Local PaddleOCR engine

This component uses PP-OCRv5 mobile detection and Latin recognition models from PaddlePaddle (Apache-2.0). It performs text detection and recognition with geometric reading order; it is not the full PP-StructureV3 pipeline and does not reconstruct tables or formulas.

- PaddleOCR: https://github.com/PaddlePaddle/PaddleOCR (Apache-2.0).
- ncnn: https://github.com/Tencent/ncnn (BSD-3-Clause). The preprocessing/inference structure follows Tencent's PPOCRv5 example, copyright 2025 Tencent.
- OpenCV: https://github.com/nihui/opencv-mobile and https://github.com/opencv/opencv (Apache-2.0).
- Clipper2: https://github.com/AngusJohnson/Clipper2 (Boost Software License 1.0).
- JSON for Modern C++: https://github.com/nlohmann/json (MIT); its copyright/license notice is retained in the compiled source distribution's json.hpp header.

Paddle2ONNX and pnnx are conversion tools used on the build runner, not runtime requirements. Source revisions, file hashes, dictionary and conversion configuration are recorded in model-manifest.json. All scripts and third-party source references are available in the application repository.

Model input and recognition run locally. No provider credentials or remote inference service are required. Model downloads are separate explicit installation actions.
