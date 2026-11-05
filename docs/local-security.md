# Local storage and access protection

Local storage protection and Venice transport privacy are separate settings. This fork keeps its data on the device and calls configured providers directly; it operates no relay or synchronization service.

## Media storage and memory

On supported Windows and Android native hosts, new image, audio and video blobs are encrypted before storage. Each file has a random AES-256 key, authenticated AES-GCM chunks of at most 1 MiB and an authenticated length manifest. Asset names, MIME types, prompts and model metadata are encrypted. IDs, sizes, timestamps and protection-scope identifiers remain visible in the index. Device-protected keys are never saved as plaintext.

History uses paginated metadata and small image thumbnails. Media players load only the opened result. Closing a preview or locking its area revokes its object URL. Downloads and encrypted backup exports stream blocks. Opening or attaching a file still needs memory for that selected file; playback does not use disk range streaming. Generated files are limited to 128 MiB, microphone/uploads to 25 MB, and the local image editor to 8 megapixels. A large legacy transcription index can still retain text metadata in memory.

Use **Settings → Data & Backup → Local media library** to inspect sizes, protect files, delete selected files, clean incomplete downloads and encrypt existing media. Migration verifies the encrypted copy before deleting the old media blob. It does not encrypt the ordinary conversation database, parsed text attachments, provider settings or external Work Mode files. Unsupported browser hosts retain their existing storage behavior; losing a previously used native device key fails rather than silently replacing it or falling back to plaintext.

“Public library” means accessible without an additional app/project PIN. Its new native media files still use device encryption. The protected library requires its scope key. Protected image sessions also encrypt prompts, errors and batch metadata; protected Studio sessions encrypt prompts, transcripts and queue metadata. Other ordinary chat and generation records retain the inherited storage format.

## App unlock and project access

Configure PIN/passphrase and biometric/device unlock independently in **Data & Backup → App lock and protected content**. If both are enabled, either method can unlock the area. A PIN requires at least six digits, or a passphrase at least ten characters. PIN derivation uses PBKDF2-SHA256 with 600,000 iterations and a random salt, plus the native device wrapper. Repeated wrong PINs trigger a local delay. Longer passphrases resist offline guessing better than short PINs.

Android uses Android Keystore AES-GCM. Device protection requires a secure device screen lock; biometric wrapping uses a per-use strong-biometric CryptoObject and is invalidated by relevant enrollment changes. Windows uses Electron safeStorage/DPAPI and a native Windows Hello consent helper tied to the app window. Windows Hello is an app access gate around DPAPI, not a separate hardware-bound encryption key. These controls do not protect against malicious code already running with the same user/app privileges.

App-open and background locking are separate switches. App locking stops current chat/image/media work, closes previews and pending approval/picker dialogs, clears query data and drops protected keys. This stops local requests/polling; it cannot guarantee cancellation of already queued server work. A forgotten PIN or unavailable device key cannot be recovered: retain an encrypted library backup separately.

In a project's context menu, choose **Project protection**: no lock, shared app unlock, or a dedicated project PIN. Projects using app unlock share that key's current unlocked state. Project protection enforces chat reads, searches, changes and drafts inside this app; it does **not** encrypt existing chat databases or external files. Locked conversations are redacted and their attachment references excluded from library selection. Private composer history stays in memory outside public prompt history. New Venice chat-tool outputs inherit the project's media scope. Changing/removing an existing lock requires unlocking it first.

## Backup and deletion

The library offers a portable `.chatboxvault` backup encrypted with a separate passphrase of at least 12 characters. It streams authenticated, ordered records and requires a complete manifest before publishing restored files. Staging contains ciphertext; cancellation/failure removes it and stale interrupted stages can be cleaned. Restore uses new file identities and the current device's keys. Keep the backup passphrase separately; it is not recoverable.

Locked scopes and attachments belonging to locked projects are excluded from library backups. Unlock wanted areas first. Restore brings back media and library metadata; it does not recreate Studio job history, image workflow relationships or conversations. Use the existing conversation backup separately. Ordinary conversation backups are not encrypted by app lock; protected media is refused by the plaintext resource exporter, so review missing-resource warnings.

Chats can be deleted directly after confirmation. Image Creator deletion cancels local work and removes its record and unshared outputs/references/thumbnails; hidden protected records make reference cleanup conservative. Studio offers separate local deletion and remote cleanup. Library deletion removes saved files; chats/histories pointing to them will no longer open those files. Exported copies and previous backups remain in their chosen locations and must be managed separately.

## Local masked image editing

Remix/edit controls show compatible models and allow explicit batch approval. Comment points use percentage coordinates. In painted-area mode, Venice receives a context crop and instructions; the mask remains local and the result is composited into the source on device. This is not a provider-side mask API. If composition fails, the unmasked paid result is retained in the library with an error, without repeating the paid call. File encoding/color profiles can change on export.

## Verification boundaries

CI tests use synthetic keys/API responses, real browser canvas operations and mocked device-key wrapping. Separate native checks compile the Windows Hello helper and Android Keystore/biometric plugin. They do not verify physical biometric enrollment/unlock, every codec/device, or paid Venice inference. See [testing](fork-testing.md) and [provider data flows](fork-privacy.md).
