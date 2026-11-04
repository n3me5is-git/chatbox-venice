import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, appendFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const secretNames = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']
export function signingSecrets(env) {
  const configured = secretNames.filter(name => env[name])
  if (!configured.length) return undefined
  if (configured.length !== secretNames.length) throw new Error('Configure all four Android signing secrets; partial signing configuration is not allowed')
  return Object.fromEntries(secretNames.map(name => [name, env[name]]))
}
export function encryptKeystore(bytes, password) {
  if (!password || password.length < 20) throw new Error('Use a backup passphrase of at least 20 characters')
  const salt = randomBytes(32); const iv = randomBytes(12)
  const key = pbkdf2Sync(password, salt, 600000, 32, 'sha256')
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()])
    return { version: 1, kdf: 'pbkdf2-sha256', iterations: 600000, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
  } finally { key.fill(0) }
}
export function decryptKeystore(backup, password) {
  if (backup.version !== 1 || backup.kdf !== 'pbkdf2-sha256' || backup.iterations !== 600000) throw new Error('Unsupported signing backup format')
  const key = pbkdf2Sync(password, Buffer.from(backup.salt, 'base64'), backup.iterations, 32, 'sha256')
  try { const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(backup.iv, 'base64')); decipher.setAuthTag(Buffer.from(backup.tag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(backup.ciphertext, 'base64')), decipher.final()]) }
  finally { key.fill(0) }
}
function run(binary, args, env) {
  const result = spawnSync(binary, args, { env, encoding: 'utf8', shell: false })
  // Do not print tool stderr: it can contain key paths or signing configuration.
  if (result.error || result.status !== 0) throw new Error(`Android signing tool failed: ${path.basename(binary)}`)
  return result.stdout
}
export function signAndroid(apk, env = process.env) {
  if (!apk || !existsSync(apk)) throw new Error('Android APK was not produced')
  const secrets = signingSecrets(env)
  const debug = path.join(homedir(), '.android', 'debug.keystore')
  const keyPath = secrets ? path.join(env.RUNNER_TEMP || tmpdir(), 'chatbox-venice-signing.keystore') : debug
  const pinPath = 'scripts/android-signing-cert.sha256'
  const pin = existsSync(pinPath) ? readFileSync(pinPath, 'utf8').trim().toLowerCase() : ''
  if (pin && !/^[0-9a-f]{64}$/.test(pin)) throw new Error('Invalid pinned Android signing certificate')
  if (!secrets && !existsSync(debug)) {
    if (pin) throw new Error('The cached Android signing key is missing. Restore the original key with repository secrets; refusing to replace the installed app identity')
    mkdirSync(path.dirname(debug), { recursive: true })
    run('keytool', ['-genkeypair', '-keystore', debug, '-storepass', 'android', '-alias', 'androiddebugkey', '-keypass', 'android', '-dname', 'CN=Android Debug,O=Android,C=US', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-storetype', 'JKS'], env)
  }
  if (secrets) {
    const bytes = Buffer.from(secrets.ANDROID_KEYSTORE_BASE64, 'base64')
    if (bytes.length < 512 || bytes.length > 65536) throw new Error('Invalid Android keystore data')
    try { writeFileSync(keyPath, bytes, { mode: 0o600 }) } finally { bytes.fill(0) }
  }
  const signer = path.join(env.ANDROID_HOME || env.ANDROID_SDK_ROOT || '', 'build-tools', '35.0.0', 'apksigner')
  const signingEnv = secrets ? env : { ...env, ANDROID_KEYSTORE_PASSWORD: 'android', ANDROID_KEY_PASSWORD: 'android' }
  try {
    run(signer, ['sign', '--ks', keyPath, '--ks-key-alias', secrets?.ANDROID_KEY_ALIAS || 'androiddebugkey', '--ks-pass', 'env:ANDROID_KEYSTORE_PASSWORD', '--key-pass', 'env:ANDROID_KEY_PASSWORD', apk], signingEnv)
    const certificate = run(signer, ['verify', '--print-certs', apk], signingEnv).match(/certificate SHA-256 digest:\s*([a-f0-9]{64})/i)?.[1]?.toLowerCase()
    if (!certificate) throw new Error('Could not verify Android signing certificate')
    if (pin && certificate !== pin) throw new Error('Android certificate differs from the pinned identity. Refusing to publish an incompatible update')
    console.log('Android signing certificate SHA-256: ' + certificate)
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `\nAndroid signing certificate SHA-256: \`${certificate}\`. Key source: ${secrets ? 'repository secrets' : 'existing CI debug key'}.\n`)
    if (env.ANDROID_SIGNING_BACKUP_PASSPHRASE) {
      const bytes = readFileSync(keyPath)
      try { mkdirSync('release/signing-backup', { recursive: true }); writeFileSync('release/signing-backup/android-keystore.aes.json', JSON.stringify(encryptKeystore(bytes, env.ANDROID_SIGNING_BACKUP_PASSPHRASE))) }
      finally { bytes.fill(0) }
      if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, 'backup_ready=true\n')
    }
    return certificate
  } finally { if (secrets && existsSync(keyPath)) unlinkSync(keyPath) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'restore') {
    if (!process.env.ANDROID_SIGNING_BACKUP_PASSPHRASE) throw new Error('Set ANDROID_SIGNING_BACKUP_PASSPHRASE in the local environment')
    const bytes = decryptKeystore(JSON.parse(readFileSync(process.argv[3], 'utf8')), process.env.ANDROID_SIGNING_BACKUP_PASSPHRASE)
    try { writeFileSync(process.argv[4] || 'restored-android.keystore', bytes, { mode: 0o600, flag: 'wx' }) } finally { bytes.fill(0) }
  } else signAndroid(process.argv[2])
}
