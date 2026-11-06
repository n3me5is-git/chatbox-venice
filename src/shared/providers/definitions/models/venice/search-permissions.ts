const permissions = new Map<string, Partial<Record<'global' | 'venice', boolean>>>()
/** Live revocation only. Persisted settings remain the source for a new reply. */
export function setSearchPermission(sessionId: string, kind: 'global' | 'venice', enabled: boolean) {
  permissions.set(sessionId, { ...permissions.get(sessionId), [kind]: enabled })
}
export function isSearchPermitted(sessionId: string | undefined, kind: 'global' | 'venice') {
  return !sessionId || permissions.get(sessionId)?.[kind] !== false
}
