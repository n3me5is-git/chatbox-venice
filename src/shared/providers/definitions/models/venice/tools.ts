import type { ToolSet } from 'ai'
import { validatedToolSchema } from '../../../../validated-tool-schema'
import { parseExtraBody } from '../../../../models/utils/extra-body'
import type { VeniceMediaService, MediaKind, MediaRecord } from './media'
import type { VeniceOptions } from './options'
type Service = Pick<VeniceMediaService, 'catalog' | 'list' | 'quote' | 'start' | 'resume' | 'pause' | 'remove' | 'cleanup'>
type Input = { action: 'catalog' | 'list' | 'quote' | 'generate' | 'status' | 'resume' | 'pause' | 'delete_local' | 'cleanup_remote'; id?: string; kind?: MediaKind; model?: string; prompt?: string; extra_json?: string }
const summary = (r: MediaRecord) => ({ id: r.id, kind: r.kind, model: r.model, status: r.status, createdAt: r.createdAt, text: r.text, error: r.error, remoteCleaned: r.remoteCleaned })
export function buildVeniceMediaTools(sessionId: string, service: Service, settings: () => VeniceOptions, confirm: (message: string) => Promise<boolean>): ToolSet {
  if (settings().enabled === false || !settings().chatToolsEnabled) return {}
  return { venice_media: {
    description: 'Optional Venice media tools for this chat only. Generate speech, video, music/SFX; quote video/music; inspect, resume or delete this chat\'s media. Content goes to Venice. Paid generation is never automatically retried. Audio/video are not E2EE. Use catalog for current model IDs. Resume an existing record instead of generating again. Local deletion does not delete the remote copy. Media can be played/exported in Venice Studio. Transcription requires user file selection in Studio.',
    inputSchema: validatedToolSchema({ type: 'object', properties: {
      action: { type: 'string', enum: ['catalog', 'list', 'quote', 'generate', 'status', 'resume', 'pause', 'delete_local', 'cleanup_remote'] },
      id: { type: 'string' }, kind: { type: 'string', enum: ['speech', 'video', 'music'] }, model: { type: 'string' }, prompt: { type: 'string' }, extra_json: { type: 'string', description: 'Optional JSON object with vendor parameters' },
    }, required: ['action'], additionalProperties: false }),
    execute: async (raw, { abortSignal }) => {
      const input = raw as Input
      const allowed = () => { abortSignal?.throwIfAborted(); if (settings().enabled === false || !settings().chatToolsEnabled) throw new Error('Venice chat media tools are disabled') }
      allowed()
      if (input.action === 'catalog') return service.catalog()
      if (input.action === 'list') return (await service.list()).filter(r => r.sessionId === sessionId).map(summary)
      if (input.action === 'generate' || input.action === 'quote') {
        if (!input.kind || input.kind === 'transcription' || !input.model || (input.action === 'generate' && !input.prompt)) throw new Error('Specify kind, model and prompt')
        const request = { kind: input.kind, model: input.model, prompt: input.prompt || '', options: parseExtraBody(input.extra_json || ''), sessionId, signal: abortSignal }
        if (input.action === 'quote') return service.quote(request)
        if (settings().confirmMediaTools !== false && !await confirm(`Generare ${input.kind} con Venice (${input.model})?\nLa richiesta può avere un costo e invia a Venice questo contenuto:\n\n${request.prompt}\n\nParametri: ${input.extra_json || '{}'}`)) return { cancelled: true }
        allowed()
        return summary(await service.start(request))
      }
      const record = (await service.list()).find(r => r.id === input.id && r.sessionId === sessionId)
      if (!record) throw new Error('Media record not found in this chat')
      if (input.action === 'status') return summary(record)
      if (['delete_local', 'cleanup_remote'].includes(input.action)) {
        if (!await confirm(input.action === 'delete_local' ? `Eliminare dal dispositivo la generazione ${record.id}? La copia remota non verrà eliminata.` : `Eliminare su Venice la generazione ${record.id}?`)) return { cancelled: true }
        allowed()
      }
      if (input.action === 'resume') await service.resume(record.id)
      else if (input.action === 'pause') await service.pause(record.id)
      else if (input.action === 'delete_local') await service.remove(record.id)
      else if (input.action === 'cleanup_remote') await service.cleanup(record.id)
      return { id: record.id, action: input.action, completed: true }
    },
  } }
}
