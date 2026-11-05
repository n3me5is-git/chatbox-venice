import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encryptKeystore, decryptKeystore, signingSecrets } from './android-signing.mjs'
test('signing requires complete repository secrets and never falls back to cache', () => {
  assert.throws(() => signingSecrets({}), /required/)
  assert.throws(() => signingSecrets({ ANDROID_KEYSTORE_BASE64: 'private' }), /all four/)
  const identity = { ANDROID_KEYSTORE_BASE64: 'example', ANDROID_KEYSTORE_PASSWORD: 'password', ANDROID_KEY_ALIAS: 'alias', ANDROID_KEY_PASSWORD: 'password' }
  assert.deepEqual(signingSecrets(identity), identity)
  assert.deepEqual(signingSecrets({ ANDROID_SIGNING_IDENTITY: JSON.stringify(identity) }), identity)
  assert.throws(() => signingSecrets({ ANDROID_SIGNING_IDENTITY: 'bad' }), /JSON object/)
  assert.throws(() => signingSecrets({ ANDROID_SIGNING_IDENTITY: '{}' }), /all four/)
  assert.throws(() => signingSecrets({ ...identity, ANDROID_SIGNING_IDENTITY: JSON.stringify(identity) }), /not both/)
})
test('private signing backups round-trip, authenticate changes and reject the wrong passphrase', () => {
  const bytes = Buffer.from('simulated-private-signing-keystore')
  const password = 'a-long-local-backup-passphrase'
  const backup = encryptKeystore(bytes, password)
  assert.deepEqual(decryptKeystore(backup, password), bytes)
  assert(!JSON.stringify(backup).includes(bytes.toString()))
  assert.throws(() => decryptKeystore(backup, password + '-wrong'))
  assert.throws(() => decryptKeystore({ ...backup, ciphertext: Buffer.from('tampered').toString('base64') }, password))
  assert.throws(() => encryptKeystore(bytes, 'short'), /20 characters/)
})
