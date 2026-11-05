// One-time recovery of the existing Android identity. Only ciphertext may be uploaded.
import { createCipheriv, createHash, createPublicKey, constants, publicEncrypt, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { signingSecrets } from './android-signing.mjs'

export function sealIdentity(identity, recipient, now = Date.now()) {
  if (recipient.repository !== 'n3me5is-git/chatbox-venice' || !Number.isFinite(Date.parse(recipient.expires)) || now >= Date.parse(recipient.expires)) throw new Error('Invalid or expired Android migration recipient')
  const publicKey = createPublicKey(recipient.publicKey)
  if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 3072) throw new Error('Migration requires an RSA public key of at least 3072 bits')
  const key = randomBytes(32); const iv = randomBytes(12)
  const payload = Buffer.from(JSON.stringify(identity))
  const aad = Buffer.from(JSON.stringify({ repository: recipient.repository, certificate: recipient.certificate, recipient: recipient.id }))
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad)
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
    return { version: 2, algorithm: 'RSA-OAEP-SHA256+AES-256-GCM', aad: aad.toString('base64'), wrappedKey: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
  } finally { key.fill(0); payload.fill(0) }
}
export function verifySigningIdentity(identity, expected, env = process.env) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid pinned signing certificate')
  const dir = mkdtempSync(path.join(env.RUNNER_TEMP || tmpdir(), 'venice-signing-check-'))
  const keyPath = path.join(dir, 'identity.keystore'); const bytes = Buffer.from(identity.ANDROID_KEYSTORE_BASE64, 'base64')
  try {
    if (bytes.length < 512 || bytes.length > 65536) throw new Error('Invalid signing keystore size')
    writeFileSync(keyPath, bytes, { mode: 0o600 })
    const result = spawnSync('keytool', ['-exportcert', '-keystore', keyPath, '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD', '-alias', identity.ANDROID_KEY_ALIAS], { env: { ...env, ...identity }, shell: false, maxBuffer: 65536 })
    if (result.error || result.status !== 0 || !result.stdout?.length) throw new Error('Could not verify the signing keystore; no private details were logged')
    const certificate = createHash('sha256').update(result.stdout).digest('hex')
    if (certificate !== expected) throw new Error('Signing identity differs from the installed app certificate; refusing migration')
    // Verify the private-key password as well, without exporting the key to logs/artifacts.
    const probe = spawnSync('keytool', ['-importkeystore', '-srckeystore', keyPath, '-srcstorepass:env', 'ANDROID_KEYSTORE_PASSWORD', '-srcalias', identity.ANDROID_KEY_ALIAS, '-srckeypass:env', 'ANDROID_KEY_PASSWORD', '-destkeystore', path.join(dir, 'probe.p12'), '-deststoretype', 'PKCS12', '-deststorepass:env', 'ANDROID_KEYSTORE_PASSWORD', '-noprompt'], { env: { ...env, ...identity }, shell: false })
    if (probe.error || probe.status !== 0) throw new Error('Could not verify the private signing key password')
    return certificate
  } finally { bytes.fill(0); rmSync(dir, { recursive: true, force: true }) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pin = readFileSync('scripts/android-signing-cert.sha256', 'utf8').trim()
  if (process.argv[2] === 'recover') {
    const recipient = JSON.parse(readFileSync('scripts/android-migration-recipient.json', 'utf8'))
    if (recipient.certificate !== pin) throw new Error('Migration recipient certificate does not match the pinned identity')
    const bytes = readFileSync(path.join(homedir(), '.android', 'debug.keystore'))
    try {
      const identity = { ANDROID_KEYSTORE_BASE64: bytes.toString('base64'), ANDROID_KEYSTORE_PASSWORD: 'android', ANDROID_KEY_ALIAS: 'androiddebugkey', ANDROID_KEY_PASSWORD: 'android' }
      verifySigningIdentity(identity, pin)
      const sealed = sealIdentity(identity, recipient)
      mkdirSync('release/signing-migration', { recursive: true })
      writeFileSync('release/signing-migration/android-identity.encrypted.json', JSON.stringify(sealed))
      console.log('Encrypted migration backup created. Public certificate SHA-256: ' + pin)
    } finally { bytes.fill(0) }
  } else if (process.argv[2] === 'verify') {
    verifySigningIdentity(signingSecrets(process.env), pin)
    console.log('Repository signing secrets verified against the installed app certificate: ' + pin)
  } else throw new Error('Choose recover or verify')
}
