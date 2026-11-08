# Session files, artifacts and local agent tools

Open **Files and resources** in a chat header. On desktop it opens the right panel’s Files tab; on a phone it opens a scrollable sheet. The tree combines managed session files, existing Work outputs, attachments, HTML chat artifacts and media generated for that chat. It loads metadata first and reads a body only when you select a resource. It does not preload the media library.

## Preview and edit

Markdown previews support GFM tables, task lists, LaTeX, Mermaid, a table of contents, local images and relative links to other session resources. External links open through the app. Remote Markdown images stay blocked until you explicitly enable them for that preview. Raw Markdown HTML is ignored. Mermaid is rendered locally as an image; diagram source is not sent to analytics.

Text files can be edited in the panel. HTML deliverables open in an isolated browser frame with network access disabled and no app bridge. Images, audio and video have local previews. Other formats can be exported to another application. The existing chat HTML artifact renderer remains available; the new explorer preview uses the local isolated path.

Use **New session file** or **Import session file** to create managed files. These files and their index use the app’s authenticated encrypted chunk storage. Project protection also applies to them. Existing Work filesystem directories retain their original storage and execution behavior; listing them does not migrate or encrypt those directories. External user-selected desktop folders are read-only in this explorer.

## Working files and deliverables

Managed files start as working files and stay out of the media library. Select **Save to deliverables** to include a final document or other output in the library; **Keep as working file** removes that classification. Scripts are not automatically deliverables. Generated media keeps its existing library behavior.

Deletion asks for confirmation and removes one selected local resource. Deleting one image from a batch keeps the other images. A chat preview or another reference to the deleted bytes can stop opening; remote provider copies require their separate cleanup controls. Source chat text is preserved when its reconstructed HTML artifact is removed. Deleting a chat also cleans up its managed files. Backups already exported to another location remain there.

## Agent tools and JavaScript

**Workspace settings → Allow the agent to manage session files and run isolated code** controls the new tools for this chat. They are exposed in Agent/Work mode when enabled:

| Tool | Purpose |
| --- | --- |
| `session_file` | List resources; read/search bounded text; create/update a managed file; import an attachment/resource; delete one managed file; mark a final file as a deliverable. |
| `session_js` | Run isolated local JavaScript against explicitly selected managed input paths. |
| `session_python` | Optional local Python, available only after installation and per-chat enablement. |

These tools use the encrypted session workspace. Existing `read_file`, `write_file`, `code_execution` and other Work tools keep their previous workspace and permissions. Agents must use `session_file` to import a resource before processing it in the managed runtime.

JavaScript runs in a fresh QuickJS worker with standard ECMAScript, bounded console output, and the existing async `files`/document helpers. It has no Node.js, shell, network, browser DOM, app store or API keys. Input files are selected explicitly. Successful file changes are committed together; cancellation, runtime errors or conflicting edits do not publish the execution changes. A `.js` file can also be run manually from its preview.

## Optional Python

In Workspace settings, choose optional packages and click **Download Python**, then enable Python for this chat. The base runtime is about 13 MB on disk. It is not bundled into every APK/installer and does not install a system Python or a compilation environment. Removing the runtime removes its cache, not session files.

The implementation pins [Pyodide 314.0.7](https://pyodide.org/en/stable/usage/downloading-and-deploying.html), verifies core assets and package wheels with SHA-256, and stores the optional runtime locally. Explicit downloads contact jsDelivr without sending chat files, prompts or API keys. Available packages come from that release’s catalog; this is not arbitrary system `pip`, native extensions or a shell environment.

Execution itself is offline in a disposable WebAssembly worker. Only the selected managed files enter `/workspace`. Use Python’s `open` or `pathlib` there. The worker has no native filesystem, app database or provider credentials. An opaque frame’s Content Security Policy independently blocks network connections; the loader can read only cached runtime/package assets. The interpreter is discarded after each run. Python uses more RAM than QuickJS; its WASM memory maximum is restricted to 256 MiB, with additional browser/loader memory outside that heap. A `.py` file can be run manually or by `session_python`.

## Backups and limits

**Back up workspace files** creates a portable encrypted archive including managed intermediate files and deliverables. Keep its passphrase separately. **Restore workspace files** imports into the current chat without replacing existing paths; collisions go under a `restored-…/` folder. The complete archive must authenticate before files are published. This archive covers managed files, not chat messages or old Work directories. Use the existing chat and library backup controls for those separate data sets.

Current bounds: 2 MiB text preview; 10 MiB per managed file; 2,048 managed files and 512 MiB per chat; 128 input/output files and 20 MiB total per execution. JavaScript has a 20-second execution deadline; Python has a 60-second host deadline including startup. Media previews in this explorer are bounded to 20 MiB; encrypted media export streams larger files through the platform exporter. Very large sessions show a truncation notice instead of loading an unbounded transcript.

## Share with an external local agent

The optional **desktop** MCP server is in Workspace settings and Settings → MCP. See [local MCP sharing](local-mcp-server.md). It is separate from the in-process Venice MCP and from the app’s existing local/remote MCP client connections. No OS terminal was added.

Venice does not currently document a public OpenAI Realtime speech-to-speech WebSocket API. Its documented agent integration uses [STT → LLM → TTS with local voice activity detection](https://docs.venice.ai/guides/integrations/livekit-agents). These workspaces do not add a new continuous voice mode.
