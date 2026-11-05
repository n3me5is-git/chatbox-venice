# Simulated testing and app verification

Actions tests never use your Venice API key or create paid content.

## Run checks without building installers

Open [Checks](https://github.com/n3me5is-git/chatbox-venice/actions/workflows/checks.yml), select **Run workflow**, then choose:

- `focused`: fork regressions, TypeScript, React UI and Chromium.
- `ui`: UI/browser checks plus TypeScript and package configuration.
- `unit`: the broader project unit suite plus static checks.

This workflow does not produce setup or APK files. Focused and UI checks also gate final builds. A failed check prevents package distribution. Rerun a failed job for an environmental failure; a source fix requires a new run on the new commit. A commit beginning `CHECKS:` also runs checks without compiling packages. A normal main-branch commit builds and publishes a new version after checks pass.

## Coverage

Mock HTTP tests cover disabled modules, speech, multipart transcription, errors/rate limits without replaying paid POSTs, local saving, queue resume, changed credentials, remote cleanup, deletion while saving and file/type limits. Tool tests check session isolation, approval, cancellation and disabling a provider while approval is open.

React tests interact with real components: required fields, model-specific voices, model changes, explicit voice previews, readable quotes, start images, invalid JSON, profiles/moderation, generation, queue resume, history and deletion. Chat panels, image selectors, settings persistence and clickable references have regression coverage. Model edit tests save and reopen the actual modal.

Other focused tests cover catalog-name matching, per-call image parameters, native MCP roundtrips, global Venice search, real SDK thinking/embedding request serialization and default requests for a public snapshot of 19 music models. These do not prove live paid inference.

Chat approval tests cover ask/similar/automatic policies, separate chats, fresh app instances, canonical parameter matching, model/batch changes, unknown/ambiguous models, required references, cancellation, scope changes and revocation. Prompt text may change under a similar-generation grant; tool, model and parameters must match. Approval defaults contain no prompt or uploaded reference content. Provider-wide legacy confirmation bypasses are superseded by the explicit chat policy.

Localization tests switch real controls between English, Italian and French without restarting. They verify nonempty resources and matching placeholders for all 15 desktop locales and existing mobile resource overlays. New fork keys have English fallbacks; existing locale translations remain in place. Core approval controls have translations for all supported desktop locales; longer new messages can fall back to English.

## Browser evidence

Chromium mounts real Venice Studio and image approval components with a local mock service. It selects a voice, creates a test WAV, exports it, simulates HTTP 429, disables a module and deletes the result. Mobile interaction uses touch events and checks scrollable controls. The image dialog selects a model, aspect ratio, moderation and seed. The scenario checks JavaScript exceptions, unexpected external requests and horizontal overflow.

Open **Artifacts → Venice-UI-simulation** in a successful run: `desktop.png` (1440×1100), `mobile.png` (412×915), `image-hitl-mobile.png`, `report.json`, and diagnostic logs. Artifacts expire after 14 days. The image model in the fixture is simulated. This is not a complete Electron/Android end-to-end test or a physical-phone screenshot.

## Physical-device and live checks

Use the published release and your own key to verify model access, chat search/citations, image generation/editing and the media modules you need. Availability, prices and accepted options can change; only a live call verifies access and inference.

On Windows/Android, check installation/update, playback/codecs, microphone permissions, export destinations and reopening. Simulated tests do not certify all devices. Export important data before a migration or reinstall.
