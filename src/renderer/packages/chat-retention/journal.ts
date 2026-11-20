export const retentionHours = [1, 6, 24, 72, 168, 360, 720] as const
export type RetentionHours = (typeof retentionHours)[number]

export interface RetainedChat {
  id: string
  expiresAt?: number
  saving?: true
  deleting?: true
  children?: string[]
}

/** A save intent survives a crash between changing the journal and revealing the chat. */
export function shouldDiscardChat(entry: RetainedChat, active: string | undefined, now: number): boolean {
  if (entry.deleting) return true
  if (entry.saving || entry.expiresAt === undefined) return entry.id !== active
  return entry.expiresAt <= now
}

export function chatPathId(path: string): string | undefined {
  const match = /^\/session\/([^/]+)\/?$/.exec(path)
  return match?.[1]
}

export function leavesTemporaryChat(id: string, path: string): boolean {
  return path === '/' || path.startsWith('/remote/') || Boolean(chatPathId(path) && chatPathId(path) !== id)
}
