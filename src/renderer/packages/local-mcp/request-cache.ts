import type { LocalMCPGrant } from '@shared/local-mcp'

type RequestOutcome = {
  fingerprint: string
  work: Promise<unknown>
  contextId?: string
  settled?: boolean
}

const calls = new Map<string, Map<string, RequestOutcome>>()

/** Scope paid request IDs to the internal run, even when the client token is stable. */
export async function runMCPRequestOnce(grant: LocalMCPGrant, key: string, input: unknown, work: () => Promise<unknown>) {
  const cache = calls.get(grant.token) ?? new Map<string, RequestOutcome>()
  calls.set(grant.token, cache)
  const canonical = JSON.stringify(input, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    : value)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  if (calls.get(grant.token) !== cache) throw Error('Local MCP access was revoked')
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const existing = cache.get(key)
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw Error('Use a new request_id for a different operation')
    return existing.work
  }
  if (cache.size >= 512) throw Error('Restart this endpoint before issuing more operations')

  const contextId = (value: unknown) => value && typeof value === 'object' && 'sessionId' in value && typeof value.sessionId === 'string'
    ? value.sessionId : undefined
  const pending = Promise.resolve().then(work)
  const entry: RequestOutcome = { fingerprint, work: pending, contextId: contextId(input) }
  cache.set(key, entry)
  void pending.then(result => {
    entry.settled = true
    entry.contextId = contextId(result) ?? entry.contextId
    if (JSON.stringify(result ?? null).length > 64000) {
      entry.work = Promise.resolve({ completed:true, resultRetained:false, message:'The original operation completed. Retrieve saved files or inspect its context; this request_id will not run it again.' })
    }
  }, () => {
    entry.settled = true
    entry.work = Promise.resolve({ failed:true, message:'The original operation failed or stopped. Inspect its saved context and explain the failure before creating a new request_id.' })
  })
  return pending
}

export function clearMCPRequestCache(grant: LocalMCPGrant) {
  calls.delete(grant.token)
}

export function clearMCPContextResults(ids: ReadonlySet<string>) {
  for (const cache of calls.values()) for (const entry of cache.values()) {
    if (entry.settled && entry.contextId && ids.has(entry.contextId)) {
      entry.work = Promise.resolve({ completed:true, resultRetained:false, message:'This temporary workspace was deleted. The original operation will not be replayed.' })
    }
  }
}
