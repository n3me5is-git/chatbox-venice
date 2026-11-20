import { localMCPEndpointId, LocalMCPAccessTokenSchema, LocalMCPStartSchema, type LocalMCPGrant, type LocalMCPStart } from '@shared/local-mcp'
import { deviceProtector } from '@/packages/vault/device'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'

const profileKey = 'local-mcp:endpoint-profiles:v1'
export type LocalMCPProfile = LocalMCPStart & { startupEnvelope?: string }

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

export async function profileForEndpoint(config: LocalMCPStart, endpoint: LocalMCPGrant, autoStart: boolean): Promise<LocalMCPProfile> {
  if (!autoStart) return config
  if (localMCPEndpointId(config) !== localMCPEndpointId(endpoint)) throw Error('The MCP endpoint changed')
  // Pin an automatically chosen port the first time so clients can reconnect unchanged.
  const stable = LocalMCPStartSchema.parse({ ...config, port: Number(new URL(endpoint.url).port) })
  const token = LocalMCPAccessTokenSchema.parse(endpoint.accessToken ?? endpoint.token)
  const startupEnvelope = await deviceProtector().protect(JSON.stringify({ token, fingerprint: await fingerprint(stable) }), false)
  return { ...stable, startupEnvelope }
}

export async function saveMCPProfile(config: LocalMCPStart, endpoint: LocalMCPGrant, autoStart: boolean) {
  const profile = await profileForEndpoint(config, endpoint, autoStart)
  const id = localMCPEndpointId(config)
  await updateMCPProfiles(rows => [...rows.filter(row => localMCPEndpointId(row) !== id), profile])
}

export async function startSavedMCPProfile(profile: LocalMCPProfile, signal?: AbortSignal) {
  const { startupEnvelope, ...saved } = profile
  const config = LocalMCPStartSchema.parse(saved)
  const id = localMCPEndpointId(config)
  if (!id) throw Error('Choose an MCP endpoint')
  signal?.throwIfAborted()
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
  if (!startupEnvelope) return ipc.invoke('local-mcp:control', 'start', config)
  const remembered = JSON.parse(await deviceProtector().unprotect(startupEnvelope))
  const accessToken = LocalMCPAccessTokenSchema.parse(remembered.token)
  if (remembered.fingerprint !== await fingerprint(config)) throw Error('The saved MCP permissions have changed. Edit and save this endpoint again.')
  return serializeProfiles(async () => {
    if (!(await readMCPProfiles()).some(row => localMCPEndpointId(row) === id && row.startupEnvelope === startupEnvelope)) {
      throw Error('This MCP startup profile is no longer enabled')
    }
    await vault().projects.assertApp()
    signal?.throwIfAborted()
    return ipc.invoke('local-mcp:control', 'restore', { config, accessToken })
  })
}

export async function restoreMCPProfiles(signal: AbortSignal) {
  startupErrors.clear()
  const profiles = await readMCPProfiles()
  for (const profile of profiles) {
    signal.throwIfAborted()
    const id = localMCPEndpointId(profile)
    if (!profile.startupEnvelope || !id) continue
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
    const { startupEnvelope: _removed, ...config } = profile
    return config
  }))
}
