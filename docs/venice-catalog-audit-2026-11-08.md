# Venice catalog audit — 2026-11-08

Source: the live public [Venice model catalog](https://api.venice.ai/api/v1/models?type=all), checked against the `type=tts` endpoint. The full reviewed regression fixture is [catalog-2026-11-08.json](../test/fixtures/venice/catalog-2026-11-08.json). Catalog reads do not generate content.

| UI category | Entries |
| --- | ---: |
| Chat | 141 |
| Image generation | 45 |
| Image editing | 30 |
| Video | 142 |
| Voice | 16 |
| Transcription | 5 |
| Music | 10 |
| Sound effects | 3 |
| Voice conversion | 1 |
| Embeddings | 9 |
| Dedicated upscaler | 1 |
| Dedicated decision models | 2 |
| Total | 405 |

Stable Audio 2.5 additionally appears in sound effects because its catalog description explicitly includes both sound design and short musical clips. Counts above use one primary category per entry. The five queued ElevenLabs/Seed voices and voice changer retain Venice's `music` transport endpoint while appearing in Voice/Voice conversion. Eleven native TTS entries use the speech endpoint. Upscale and decision entries are not mislabeled as ordinary image/chat generation models; they belong to dedicated APIs.

## Corrections

- Live provider facts now replace stale saved types, capabilities and privacy metadata while retaining user labels, profiles and extra request parameters. A selected image model such as **Krea 2 Turbo** can no longer disappear merely because its saved type was `chat` or its saved privacy was outdated.
- Internal catalog synchronization reads complete facts before applying Privacy Only. This allows it to correct an obsolete privacy claim as well as hide newly disallowed models. Image selectors, agent image choices and generation preflight apply the current privacy filter.
- Image picker selection follows IDs from the current image catalog, rather than requiring every old saved record already to have the correct type. Other providers retain their existing projection behavior.
- Explicit video-input flags override name-based fallbacks. For example, the current Seedance 2.5 Edit entry declares `video_input: false`; the UI no longer forces a source-video upload simply because its ID contains `edit-video`.
- Krea 2 Turbo is currently an image-generation model, private, uncensored, with no style references. Its catalog lists 0.04 USD/DIEM for 1K and 0.06 for 2K. Its separate upscale fees are not used as its generation price.

## Costs and failures

Selectors and selected-model controls show available catalog rates, units and ranges. Token input/output, characters, image, second and generation prices are distinguished. Unknown or variable rates require the existing model details/estimate controls; missing data is not interpreted as free. Price is not a model-quality rating.

Image Creator and Studio show failure reasons directly, including failed history records. For HTTP errors the client preserves bounded structured message/validation fields and the HTTP status. It excludes unstructured response dumps and unrelated request fields, and redacts recognizable credentials. Paid failures are not retried automatically.

## Scope

Regression tests review all 405 classifications, all 75 image/edit selector entries with deliberately obsolete saved types, queued speech/music separation, privacy updates, video input flags and price parsing. Browser checks select Krea 2 Turbo, show its cost range and display a simulated provider validation failure on a phone viewport. This audit does not claim a successful paid inference with every model; actual model availability, permissions, rates and constraints can change after the recorded catalog.
