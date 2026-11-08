import type { MessageToolCallPart } from '@shared/types'
import type { MediaRecord } from '@shared/providers/definitions/models/venice/media'
import type { SessionResource } from '@shared/session-resources'
/** Transcript references are identifiers only: never trust a model-supplied URL or blob key. */
export function mediaArtifactIds(parts: readonly MessageToolCallPart[]): string[] {
  const ids = new Set<string>()
  for (const part of parts) {
    if (part.toolName !== 'venice_media' || part.state !== 'result') continue
    const rows = Array.isArray(part.result) ? part.result : [part.result]
    for (const value of rows) {
      if (!value || typeof value !== 'object') continue
      const row = value as { id?: unknown; kind?: unknown; artifact?: { type?: unknown; recordId?: unknown } }
      const id = row.artifact?.type === 'venice_media' ? row.artifact.recordId : typeof row.kind === 'string' ? row.id : undefined
      if (typeof id === 'string' && /^[\w-]{1,200}$/.test(id)) ids.add(id)
      if (ids.size >= 20) return [...ids]
    }
  }
  return [...ids]
}
export function mediaArtifactResource(record: MediaRecord, sessionId: string): SessionResource {
  if (record.sessionId !== sessionId || !record.blobKey || record.protectedRecord) throw new Error('This media is not available in this chat')
  return { id: 'media:' + record.id, recordId: record.id, path: `media/${record.kind}/${record.id}.${record.mime?.split('/')[1] || 'bin'}`, name: record.prompt.slice(0,70) || record.model, mime: record.mime || 'application/octet-stream', origin: 'media', key: record.blobKey, deliverable: true }
}
