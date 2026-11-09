# Android feature parity audit — 1.40.1

This audit covers the Capacitor Android app produced by this fork's release workflow. A desktop test or a narrow browser viewport alone does not establish Android registration. Tests use synthetic transports/accounts; they do not claim paid inference or physical-phone biometrics were exercised.

## Confirmed omissions repaired

| Requested feature | Failure before this patch | Shared implementation and evidence |
| --- | --- | --- |
| ChatGPT images in subscription Work chats | Android did not register the tool; the independent image generator could still work. A saved text-only catalog could also hide it. | session-work-tools.ts and subscription image-tools tests; actual fresh Capacitor preparation and restored-call registration. |
| On-demand and dedicated agents | The Android Work registry did not include delegation. | Shared registry plus runtime-parity.test.ts; real renderer worker execution with a mocked inference transport in external.test.ts on both platform identities. |
| Questions with choices/custom answers | Android omitted ask_user. | Shared registry; Android schema/dispatch tests and real worker question dispatch. |
| Separate Brave/Google/Exa tools | Mobile built a single search tool independently of the global separate-engine setting. | Mobile now uses buildWebSearchTools; registration and global search tool tests. |
| Session image preview for the model | Mobile supplied workspace tools without their image-result injection hook. | Vision-aware workspace registration and composed prepareStep hooks, covered by runtime-parity.test.ts. |
| Explicit references to other conversations | The owner-only reader was absent on Android. | Shared registration; guest exclusion and permission revocation tests. |
| Venice tool opt-in/restrictions and collaborator approvals | Mobile used an outdated provider-name branch, with separate resumed-call behavior. | Shared provider policy, live revocation and requester-aware approval routing for fresh and resumed calls. |
| Accurate image capabilities | Mobile CLI reported imageGeneration=false even when separate native tools existed. | CLI now reports its scope, native imageTools and CLI imageCommands separately. |
| Image generation inside child agents | Worker allowlist/implementation omitted chatgpt_image on both platforms. | Inherited root tool permission, subscription-only worker/root scope and live revocation; real worker adapter test. |

The shared session extension is used by the desktop builder and by a single Capacitor fresh/resumed registration helper. It preserves the existing mobile skill active-tool set, local file/OS tools and legacy view_image behavior.

## Other requested areas inspected

| Area | Android path and validation boundary |
| --- | --- |
| File tree, import, folders, editing, per-file deletion and previews | Shared SessionResources UI and encrypted file services; mobile legacy workspace has explicit read/save/delete adapters. Images/audio/video/text/Markdown use shared viewers. Inline PDF iframe viewing is desktop-only; Android can export files and print Markdown to PDF. No Office viewer is added. |
| Markdown rendering and HTML/PDF export | Shared Markdown viewer and standalone HTML; AndroidDocumentSaver.printHtml uses Android's print/save flow for PDF. Renderer/export tests and generated native plugin checks cover this integration, not a physical print dialog. |
| Microphone and on-demand speech | Shared speech controls/privacy policy and recorder; generated Android runtime/WebView microphone permissions. Hardware permission prompts still need physical-device confirmation. |
| Encrypted media, protected library/projects, PIN/biometrics and background timeout | Shared vault/protection/history and timeout services with native Android device protector. Hardware keystore/biometric behavior is not established by browser mocks. |
| Studio, model information, pricing, privacy filters and media viewers | Shared UI and catalog logic; narrow-viewport browser and unit tests cover filtering, scrolling and selected capabilities. Real provider capability availability still depends on its API/catalog. |
| Remote chat, transfer, author labels and collaboration HITL | Shared WebRTC/application protocol and remote UI; transport tests use real browser peers, including TURN fixtures. Android background sharing uses the native foreground service; Android may still terminate it. |
| Thinking, context ceilings and worker context | Shared model/provider settings, generation compaction and worker context manager; context and worker suites cover inheritance/overrides. |
| Remote MCP | Same controller and shared permission wrappers. Local stdio MCP and the app-as-MCP-server listener were requested for desktop and remain desktop capabilities. |
| JavaScript and optional Python | Shared session tools use the isolated mobile worker. Python remains explicitly optional and subject to its existing enable/download flow. |

## Caller-facing agent information

Description is multiline. Additional details can specify when to call an agent, input expectations and outputs. Worker instructions can optionally be appended to its description; existing agents default to private instructions. Permitted root callers, nested workers and desktop external MCP callers receive the same description policy. The guardian policy is never appended. Permission checks and guardian review remain authoritative regardless of any text in the description.

## Regression locations

- src/renderer/packages/mobile-work-mode/runtime-parity.test.ts
- src/renderer/packages/multi-agent/external.test.ts
- src/shared/multi-agent-description.test.ts
- src/shared/local-mcp-agents.test.ts
- src/renderer/components/multi-agent/AgentCallingDetails.test.tsx
- .github/workflows/checks.yml (Android parity, multi-agent, resources, speech, protection, collaboration and UI jobs)
