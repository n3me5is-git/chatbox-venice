# Media jobs and conversation artifacts

Image jobs already use Chatbox's background completion notifications. Venice video, queued speech, music and sound effects use the media service's background queue retrieval. These paths keep their existing job identifiers and never regenerate content to retrieve a result.

With Venice chat media tools enabled, the agent can use:

- `venice_media` with `action: wait`, an existing `id` and optional `timeout_seconds` (0–60, default 30). The wait listens for local job updates rather than adding provider requests. A timeout returns the current state; it is not a failed generation. An error or paused job is returned immediately. Stopping the conversation cancels the wait without submitting anything.
- `action: status` to inspect the current state immediately.
- `action: show` to attach an existing result's artifact card to the current reply. The user chooses when to open it. No generation approval or new paid request is needed to recall a saved result.
- `action: resume` to explicitly resume retrieval of an interrupted existing queue ID, subject to the existing endpoint/key checks. This is different from generating again.

Cards retain identifiers in the transcript, not media bytes or remote download URLs. The UI resolves an identifier against this session's saved records. Cards can show queue progress and errors; ready audio/video opens in a modal using the same native viewer component as the explorer. Playback stays local and works independently of the generation provider being enabled. Protected creations require preview authentication. Deleting the creation, locking the app, changing the protection scope or closing the viewer dismisses playback and releases its object URL. Late reads are discarded and their decrypted buffers cleared.

The explorer's existing preview size limits still apply; this change does not introduce unbounded media preloading or disk range streaming. Only the selected file is opened. Use Studio/explorer export for files outside preview limits. Server-side generation may continue after waiting or local polling is stopped, and may still incur its original cost.
