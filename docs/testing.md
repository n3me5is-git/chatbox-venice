# Testing Chatbox Community Edition

Use Node.js 22 and the pnpm version declared in `package.json`.

- `pnpm install --no-frozen-lockfile` installs dependencies.
- `pnpm check` generates routes and checks TypeScript.
- `pnpm lint` checks source with Biome.
- `pnpm test` runs deterministic Vitest suites. Provider suites require explicit opt-in.
- `pnpm build` builds main, preload, and renderer without packaging or signing.

Tests live beside source files and under `test/integration`. Prefer fixed fixtures, in-memory repositories, and fake model responses. Await asynchronous operations and clean up resources. Keep tests for storage revisions, migration, backup compatibility, and generation cancellation when changing those contracts.

Real provider tests are optional and require separately configured credentials and network access. Default unit tests must not call live providers. See package scripts for the available opt-in suites; record only checks actually executed.

## Session workspaces and local MCP

The focused Actions suite covers encrypted file/index transactions, workspace backup authentication and collision handling, all-branch paginated resource discovery, deletion aliases and image-batch preservation, path/symlink confinement, execution cancellation/conflicts, optional Python asset hashes and WASM memory bounds, MCP permissions and credential redaction. A real MCP SDK client exercises the loopback server, resource reads, denied mutations, token rotation, Host/Origin rejection and cancellation. Renderer adapter tests cover model approval, privacy filtering, reconfiguration and schema validation.

UI tests cover tree interactions, Markdown/KaTeX/Mermaid, heading links, file import naming, read/edit/delete, independent workspace/Python/MCP controls and English/Italian strings. Browser simulation runs real QuickJS and cached Pyodide with NumPy, creates Markdown output in an encrypted test workspace and captures desktop/phone screenshots. Test-only runtime assets are hash checked and served byte-for-byte; they are not production app downloads or APK contents.

Additional standalone Edge probes using the production Python worker verify real NumPy output, a Python MemoryError beyond the configured WASM ceiling, and failed fetch/XHR under the offline CSP. Browser/loader RAM is outside the WASM heap limit. Device-specific performance, physical Android biometrics and paid provider inference are separate from these simulated checks. No new live paid Venice test is needed for local file execution or loopback MCP transport.
