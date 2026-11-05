# Migrate Android signing from cache to repository secrets

The APK certificate introduced in 1.25.0 must remain unchanged for existing installations to update in place. Its SHA-256 fingerprint is pinned in `scripts/android-signing-cert.sha256`. Never generate a replacement key as an automatic fallback.

## Current policy

Android package jobs require repository secrets. They never restore, save or generate a signing key through Actions caches. Missing or partial secrets fail the job. The keystore is written temporarily with owner-only permissions and removed after signing. The public certificate is compared with the pinned identity before an APK can be published.

Choose **one** configuration:

- One repository secret named `ANDROID_SIGNING_IDENTITY`, containing a JSON object with all four fields `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- The same four fields stored as four individual repository secrets.

Do not configure both forms. Neither contains a Venice API key. Do not paste their values into chat, source files, issues or workflow inputs.

## Recover the existing cache safely

The **Android signing migration** workflow runs independently of compilation and packaging. Its recovery job is restricted to this repository's `main` branch. It restores the existing cache read-only, verifies the original certificate and private-key password, and encrypts the complete signing identity for the public RSA recovery recipient in `scripts/android-migration-recipient.json`.

Only the public recovery key is committed. The recovery private key is protected locally using Windows DPAPI for the current Windows user. The exported identity uses RSA-OAEP-SHA256 plus AES-256-GCM with authenticated repository/certificate/recipient metadata. The workflow uploads ciphertext only, retained for one day, and removes the restored keystore from the runner. The recipient expires after two days; expiry prevents new exports and does not prevent decrypting an existing backup.

Download and retain the encrypted export and protected local recovery key together. The supplied local PowerShell helper decrypts the identity in memory, places it on the clipboard for the GitHub secret form and clears the clipboard after confirmation. It never writes a plaintext keystore or identity JSON to disk. Clipboard history/synchronization can retain copies: disable those Windows features before transferring signing material. The DPAPI recovery key is tied to this Windows profile; it is not a portable disaster-recovery backup.

## Verify before deleting the old cache

After saving the repository secret, manually run **Android signing migration → verify-and-purge** on `main`. This checks the certificate and access to the private key using the configured secrets. Only after verification succeeds does a narrowly scoped `actions: write` step delete the exact legacy signing-cache key. It leaves dependency/build caches intact. This job requires no renderer compilation, Android SDK or APK build.

Recovery remains incomplete until that verification succeeds. Removing a public cache does not undo any access that may have occurred while the key was cached. There is no evidence of a key leak, but moving the same identity into Secrets cannot prove it was never accessed. Changing the signing identity would require a separately planned migration of installed apps.

## Long-term backup

Keep a separate portable encrypted backup and its passphrase outside GitHub. Optional secret `ANDROID_SIGNING_BACKUP_PASSPHRASE` creates an AES-256-GCM/PBKDF2 backup during a successful signing job; download it before its artifact expires. Protect the original alias/passwords too. DPAPI recovery is useful on this computer, but does not replace that backup.
