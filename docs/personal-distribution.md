# Personal installation and package signing

This fork distributes the Windows setup and Android APK through [GitHub releases](https://github.com/n3me5is-git/chatbox-venice/releases), rather than Google Play or Microsoft Store. A commercial Windows certificate is not required to create the installer; Windows may warn about unsigned software.

## Android without a Google Play developer account

Since 1.25.0, Actions builds a release-mode APK, signs it and verifies the certificate. Signing uses a project key and does not require Google Play registration.

Personal ADB installation remains available without developer registration/verification according to the [official Android FAQ](https://developer.android.com/developer-verification/guides/faq). Browser-based APK installation depends on device, version, region and current Android rules; apps from unverified developers may require Android's [advanced installation flow](https://support.google.com/android/answer/17588095). This fork does not bypass device checks.

ADB needs Platform Tools, not Android Studio or the full build SDK. After authorizing your computer on the phone, update with `adb install -r path-to-file.apk`. Use packages from this fork's releases.

## Preserve signing identity

In-place updates require the same key. The workflow requires GitHub repository secrets. Configure one `ANDROID_SIGNING_IDENTITY` JSON secret with all four fields below, or configure the four individual secrets. Do not use both forms:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

Configure them in **Settings → Secrets and variables → Actions → Repository secrets**. These are not Google accounts and do not contain your Venice key. Incomplete signing configuration fails instead of falling back to another key. A secrets-supplied keystore exists only temporarily on the runner, is removed afterwards, and is never cached or uploaded unencrypted.

Without complete secrets, CI refuses to build another APK. Cache fallback and automatic key generation are disabled. See [the signing migration procedure](android-signing-migration.md) to preserve the existing key. The 1.24.2 certificate differs from 1.25.0 and later; export its data before reinstalling if needed.

GitHub can evict caches; a cache is not a permanent backup. A different/new key does not preserve an older key's identity and may require export, uninstall and reinstall. The **Sign and verify Android package** job prints the public certificate SHA-256 fingerprint. `scripts/android-signing-cert.sha256` pins the 1.25.0 identity: missing fallback keys or a mismatched certificate stop distribution rather than publish an incompatible update. Never put passwords or private material in that file.

## Encrypted backup of the current key

Add repository secret `ANDROID_SIGNING_BACKUP_PASSPHRASE`, using a strong passphrase of at least 20 characters. After the next successful Android signing job, download **Android-signing-backup-encrypted** and store it outside GitHub; CI artifacts expire after 14 days. Keep the passphrase separately. The key cannot be recovered without it.

The backup uses AES-256-GCM, random salt/nonce and PBKDF2-SHA256 with 600,000 iterations. It contains only the encrypted keystore, not its passwords or your Venice key. The migrated personal identity retains its original Android alias/password values. The workflow no longer caches the signing key. For a custom key, retain its original alias and passwords too.

To restore on a trusted system with Node, set environment variable `ANDROID_SIGNING_BACKUP_PASSPHRASE` and run:

```text
node scripts/android-signing.mjs restore android-keystore.aes.json restored-android.keystore
```

The command refuses to overwrite an existing file. Base64-encode the restored keystore into the GitHub secret. Do not commit it or paste it into chat/logs. Remove the passphrase from the environment afterwards and protect the restored key.

Finish the signing migration and retain a protected backup before removing recovery material. Actions cannot reconstruct a lost private key.
