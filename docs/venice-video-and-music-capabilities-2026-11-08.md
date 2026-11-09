# Venice video and music capabilities audit — 2026-11-08

This audit distinguishes a model's general advertised features from the transport accepted by Venice's public API. It does not generate paid content.

## Video filtering and privacy

Compared all 142 current video IDs from [`GET /models?type=all`](https://api.venice.ai/api/v1/models?type=all) with the [official documentation model explorer's data](https://github.com/veniceai/api-docs/blob/main/data/model-catalog.json), generated at `2026-11-08T20:32:10.684Z`. The [video model list](https://docs.venice.ai/models/video) contains the same variant IDs.

Results: **43 variants declare uncensored; no discrepancies between API and explorer on that marker or privacy**. These sources share a catalog pipeline, so agreement is consistency evidence rather than an independent moderation test. The compact comparison is saved in [the test fixture](../test/fixtures/venice/video-flags-docs-2026-11-08.json).

The uncensored marker appears on Seedance 1.5 Pro, the listed Wan families, Ovi, MiniMax H3 / H3 Enhanced / H3 Max and Longcat variants. It is absent from current Seedance 2.0, Fast, Mini and 2.5 variants. No current Seedance 2 Enhanced API ID was found. Do not inherit a flag across a version or model family. Missing metadata remains **not declared**, not a claim that filtering is absent or present.

An uncensored marker is a catalog declaration. It is not a guarantee that a prompt, source image or reference video will pass provider/media policy. The [Seedance guide](https://docs.venice.ai/guides/media/seedance-2-0) specifically distinguishes the public `*-basic` API from capabilities available inside Venice's own app/Studio.

## Video workflow discrepancies

The same display name is used for multiple endpoints. Text-to-video, first-frame animation, reference-driven generation and video editing must be distinguished by exact API ID and accepted fields.

- Seedance R2V entries advertise `model_type: image-to-video`; their ID and guide identify reference-driven generation. They also support editing through `reference_video_urls`. A false `video_input` flag concerns `video_url`, not every possible video-reference field.
- Seedance I2V derives aspect ratio from its image. The catalog's empty aspect-ratio list must not be interpreted as unrestricted values; sending a custom ratio can fail.
- The guide documents optional last frames for Seedance 2.0 / Fast / 2.5 I2V. Support is distinct from a mandatory last-frame input.
- Seedance 2.5 R2V edit requests can use `omni_reference_task_type: edit`, `duration: auto` and `aspect_ratio: adaptive`, with one reference video and an editing prompt. The hint is not a generic parameter for every video model.
- Accurate reference-video quotes require `reference_video_total_duration`; that quote-only value must not be added to the queue request.

The app keeps model availability and privacy from the live catalog and supplements these specific transport rules from the [queue contract](https://docs.venice.ai/api-reference/endpoint/video/queue) and guide. It does not silently substitute another model. Studio offers workflow filters while retaining an all-workflows view.

## ElevenLabs Music audio references: unresolved documentation gap

The [ElevenLabs Music](https://venice.ai/models/elevenlabs-music) and [Music v2.5](https://venice.ai/models/elevenlabs-music-v2-5) pages describe short audio references and other upstream editing features. The current [public audio queue contract](https://docs.venice.ai/api-reference/endpoint/audio/queue), [music guide](https://docs.venice.ai/guides/media/music-and-sound-effects) and the three live ElevenLabs Music catalog entries do **not** document a reference-input parameter. The [official Venice CLI music command](https://github.com/veniceai/venice-cli/blob/main/src/commands/music.ts) also exposes text, lyrics, duration and instrumental controls, without a reference file.

This is insufficient to assert that the reference feature is impossible, and insufficient to claim it works through Venice's public API. In particular, a successful response to an unknown extra field would not prove that the server used the attachment; the field could be ignored. No speculative paid request was submitted, and no nonfunctional upload control was added. Reference attachments for music are **not implemented in this fork's Studio** pending a verified Venice transport.

The live public Venice Studio was inspected in guest mode with ElevenLabs Music v2.5 selected: the music interface exposed a prompt, duration, model selector and Force Instrumental setting, with no reference-upload control. A sign-in notice was visible. This is direct UI evidence for the public guest interface; account-specific controls after sign-in have not been verified.

The app's custom JSON remains available for documented vendor options. Model cards should not label unverified music references as supported by this integration.

Rechecked on 2026-11-09 against the live queue documentation, official CLI and [official Venice MCP server](https://github.com/veniceai/venice-mcp-server/blob/main/src/tools/index.ts). Its `venice_music_generate` schema exposes the same text/lyrics/duration/instrumental/loop/voice/language/speed options and no audio-reference input. The model page continues to advertise upstream reference generation. The discrepancy remains external to this integration; a working reference feature cannot be claimed from these contracts.
