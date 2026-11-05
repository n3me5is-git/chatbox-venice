import { test } from 'node:test'
import assert from 'node:assert/strict'
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { sealIdentity } from './android-signing-migration.mjs'

test('migration exposes only authenticated ciphertext for the intended recipient', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 })
  const recipient = { repository: 'n3me5is-git/chatbox-venice', id: 'local-test', expires: '2030-01-01', certificate: 'a'.repeat(64), publicKey: publicKey.export({ type: 'spki', format: 'pem' }) }
  const identity = { ANDROID_KEYSTORE_BASE64: 'simulated-private-key', ANDROID_KEYSTORE_PASSWORD: 'private-password' }
  const sealed = sealIdentity(identity, recipient, 0)
  assert(!JSON.stringify(sealed).includes('simulated-private-key'))
  const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(sealed.wrappedKey, 'base64'))
  const open = (tag = sealed.tag) => { const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64')); decipher.setAAD(Buffer.from(sealed.aad, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()])) }
  assert.deepEqual(open(), identity)
  assert.throws(() => open(Buffer.alloc(16).toString('base64')))
  assert.throws(() => sealIdentity(identity, { ...recipient, expires: '1970-01-01' }, 1), /expired/)
  assert.throws(() => sealIdentity(identity, { ...recipient, repository: 'other/repo' }, 0), /Invalid/)
  const other = generateKeyPairSync('rsa', { modulusLength: 3072 })
  assert.throws(() => privateDecrypt({ key: other.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(sealed.wrappedKey, 'base64')))
  key.fill(0)
})
