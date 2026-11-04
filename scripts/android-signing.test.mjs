import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encryptKeystore, decryptKeystore, signingSecrets } from './android-signing.mjs'
test('signing is opt-in and never silently accepts partial secrets', () => {
  assert.equal(signingSecrets({}), undefined)
  assert.throws(() => signingSecrets({ ANDROID_KEYSTORE_BASE64: 'private' }), /all four/)
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
