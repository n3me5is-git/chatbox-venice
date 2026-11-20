import { localMCPEndpointId, LocalMCPClientTokenSchema, LocalMCPStartSchema, type LocalMCPGrant, type LocalMCPStart } from '@shared/local-mcp'
import { deviceProtector } from '@/packages/vault/device'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'

const profileKey = 'local-mcp:endpoint-profiles:v1'
export type LocalMCPProfile = LocalMCPStart & {
  startupEnvelope?: string // legacy profiles combined startup and token persistence
  tokenEnvelope?: string
  autoStartEnvelope?: string
}
type ProfileOptions = { autoStart: boolean; rememberToken: boolean }

export const mcpProfileStartsAutomatically = (profile: LocalMCPProfile) => !!(profile.autoStartEnvelope || profile.startupEnvelope)
export const mcpProfileRemembersToken = (profile: LocalMCPProfile) => !!getEnvelope(profile)
const getEnvelope = (profile: LocalMCPProfile) => profile.tokenEnvelope ?? profile.startupEnvelope

export const startupErrors = new Set<string>()
export const localMCPChanged = () => window.dispatchEvent(new Event('local-mcp:state-changed'))
const vault = () => vaultRuntimeFor(platform)

export function readMCPProfiles() {
  return vault().db.getSetting<LocalMCPProfile[]>(profileKey).then(value => Array.isArray(value) ? value : [])
}

let pending: Promise<unknown> = Promise.resolve()
function serializeProfiles<T>(work: () => Promise<T>) {
  const next = pending.then(work)
  pending = next.catch(() => {})
  return next
}
export function updateMCPProfiles(change: (profiles: LocalMCPProfile[]) => LocalMCPProfile[]) {
  return serializeProfiles(async () => {
    const db = vault().db
    for (let retry = 0; retry < 8; retry++) {
      const current = await db.getSetting<LocalMCPProfile[]>(profileKey)
      const records = change(Array.isArray(current) ? current : [])
      if (await db.setSettingIfUnchanged(profileKey, current, records)) return
    }
    throw Error('MCP profiles changed. Please try again.')
  })
}

async function fingerprint(config: LocalMCPStart) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(config)))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

function profileConfig(profile: LocalMCPProfile) {
  const { startupEnvelope, tokenEnvelope, autoStartEnvelope, ...saved } = profile
  return LocalMCPStartSchema.parse(saved)
}

export async function readMCPProfileToken(profile: LocalMCPProfile) {
  const envelope = getEnvelope(profile)
  if (!envelope) return undefined
  await vault().projects.assertApp()
  const remembered = JSON.parse(await deviceProtector().unprotect(envelope))
  if (!profile.tokenEnvelope && remembered.kind !== undefined) {
    throw Error('The saved MCP permissions have changed. Edit and save this endpoint again.')
  }
  const accessToken = LocalMCPClientTokenSchema.parse(remembered.token)
  if (remembered.fingerprint !== await fingerprint(profileConfig(profile))) {
    throw Error('The saved MCP permissions have changed. Edit and save this endpoint again.')
  }
  await vault().projects.assertApp()
  return accessToken
}

async function profileForEndpoint(config: LocalMCPStart, endpoint: LocalMCPGrant, options: ProfileOptions): Promise<LocalMCPProfile> {
  if (!options.autoStart && !options.rememberToken) return config
  if (localMCPEndpointId(config) !== localMCPEndpointId(endpoint)) throw Error('The MCP endpoint changed')
  // Pin an automatically chosen port the first time so clients can reconnect unchanged.
  const stable = LocalMCPStartSchema.parse({ ...config, port: Number(new URL(endpoint.url).port) })
  const profile: LocalMCPProfile = { ...stable }
  const binding = await fingerprint(stable)
  if (options.autoStart) {
    profile.autoStartEnvelope = await deviceProtector().protect('mcp-autostart:' + binding, false)
  }
  if (options.rememberToken) {
    const token = LocalMCPClientTokenSchema.parse(endpoint.accessToken ?? endpoint.token)
    profile.tokenEnvelope = await deviceProtector().protect(
      JSON.stringify({ kind: 'client-token', token, fingerprint: binding }), false,
    )
  }
  return profile
}

export async function saveMCPProfile(config: LocalMCPStart, endpoint: LocalMCPGrant, options: ProfileOptions) {
  const profile = await profileForEndpoint(config, endpoint, options)
  const id = localMCPEndpointId(config)
  await updateMCPProfiles(rows => [...rows.filter(row => localMCPEndpointId(row) !== id), profile])
  return profile
}

export async function startSavedMCPProfile(profile: LocalMCPProfile, signal?: AbortSignal) {
  const config = profileConfig(profile)
  const id = localMCPEndpointId(config)
  if (!id) throw Error('Choose an MCP endpoint')
  signal?.throwIfAborted()
  if (signal && !profile.autoStartEnvelope && (!profile.startupEnvelope || profile.tokenEnvelope)) {
    throw Error('This MCP endpoint profile has changed. Please try again.')
  }
  const ipc = window.electronAPI
  await vault().projects.assertApp()
  if (!await vault().available()) throw Error('Device encryption is unavailable')
  if (!config.application) {
    const [{ rendererApplication }, { isTemporaryChat, isUnavailableChat }] = await Promise.all([
      import('@/app/renderer-application'), import('@/packages/chat-retention/retention'),
    ])
    await vault().projects.assertSession(config.sessionId)
    if (isTemporaryChat(config.sessionId) || isUnavailableChat(config.sessionId) || !await rendererApplication.sessions.getSessionHeader(config.sessionId)) {
      throw Error('This chat is unavailable for MCP sharing')
    }
  }
  signal?.throwIfAborted()
  if (signal && profile.autoStartEnvelope) {
    const expected = 'mcp-autostart:' + await fingerprint(config)
    if (await deviceProtector().unprotect(profile.autoStartEnvelope) !== expected) {
      throw Error('The saved MCP permissions have changed. Edit and save this endpoint again.')
    }
  }
  const accessToken = await readMCPProfileToken(profile)
  return serializeProfiles(async () => {
    const saved = (await readMCPProfiles()).find(row => localMCPEndpointId(row) === id)
    if (!saved || JSON.stringify(saved) !== JSON.stringify(profile)) {
      throw Error('This MCP endpoint profile has changed. Please try again.')
    }
    await vault().projects.assertApp()
    signal?.throwIfAborted()
    return accessToken === undefined
      ? ipc.invoke('local-mcp:control', 'start', config)
      : ipc.invoke('local-mcp:control', 'restore', { config, accessToken })
  })
}

export async function restoreMCPProfiles(signal: AbortSignal) {
  startupErrors.clear()
  const profiles = await readMCPProfiles()
  for (const profile of profiles) {
    signal.throwIfAborted()
    const id = localMCPEndpointId(profile)
    if (!mcpProfileStartsAutomatically(profile) || !id) continue
    try {
      const current = await window.electronAPI.invoke('local-mcp:control', 'status', id)
      if (!current.running) await startSavedMCPProfile(profile, signal)
    } catch {
      if (!signal.aborted) startupErrors.add(id)
    }
  }
}

export function disableMCPStartup(target: string) {
  return updateMCPProfiles(profiles => profiles.map(profile => {
    if (target !== 'all' && !(target === 'shares' && !profile.application) && localMCPEndpointId(profile) !== target) return profile
    const { startupEnvelope, autoStartEnvelope: _removed, ...config } = profile
    return startupEnvelope && !config.tokenEnvelope ? { ...config, tokenEnvelope: startupEnvelope } : config
  }))
}
