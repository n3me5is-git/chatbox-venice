import { mediaCategory, isSoundEffectsModel } from './media-capabilities'
import type { ToolSet } from 'ai'
import { validatedToolSchema } from '../../../../validated-tool-schema'
import { parseExtraBody } from '../../../../models/utils/extra-body'
import type { VeniceMediaService, MediaKind, MediaRecord } from './media'
import type { VeniceOptions } from './options'
type Service = Pick<VeniceMediaService, 'catalog' | 'list' | 'quote' | 'start' | 'resume' | 'pause' | 'remove' | 'cleanup'>
export interface MediaApprovalContext { action: 'generate' | 'delete_local' | 'cleanup_remote'; kind?: MediaKind; model?: string; options?: Record<string, unknown>; prompt?:string; id?:string; signal?:AbortSignal }
type Input = { action: 'catalog' | 'list' | 'quote' | 'generate' | 'status' | 'resume' | 'pause' | 'delete_local' | 'cleanup_remote'; id?: string; kind?: MediaKind; model?: string; prompt?: string; extra_json?: string }
const summary = (r: MediaRecord) => ({ id: r.id, kind: r.kind, model: r.model, status: r.status, createdAt: r.createdAt, text: r.text, error: r.error, remoteCleaned: r.remoteCleaned })
export function buildVeniceMediaTools(sessionId: string, service: Service, settings: () => VeniceOptions, confirm: (message: string, request?: MediaApprovalContext) => Promise<boolean>): ToolSet {
  if (settings().enabled === false || settings().chatToolsEnabled === false) return {}
  return { venice_media: {
    description: 'Optional Venice media tools for this chat only. Generate speech, video, music or sound-effects (separate kinds); quote video/music; inspect, resume or delete this chat\'s media. Content goes to Venice. Paid generation is never automatically retried. Audio/video are not E2EE. Use catalog for current model IDs, then catalog with the selected model ID to inspect its full supported options before generation. Resume an existing record instead of generating again. Local deletion does not delete the remote copy. Media can be played/exported in Venice Studio. Transcription requires user file selection in Studio.',
    inputSchema: validatedToolSchema({ type: 'object', properties: {
      action: { type: 'string', enum: ['catalog', 'list', 'quote', 'generate', 'status', 'resume', 'pause', 'delete_local', 'cleanup_remote'] },
      id: { type: 'string' }, kind: { type: 'string', enum: ['speech', 'video', 'music', 'sound-effects'] }, model: { type: 'string' }, prompt: { type: 'string' }, extra_json: { type: 'string', description: 'Optional JSON object with vendor parameters' },
    }, required: ['action'], additionalProperties: false }),
    execute: async (raw, { abortSignal }) => {
      const input = raw as Input
      const allowed = () => { abortSignal?.throwIfAborted(); if (settings().enabled === false || settings().chatToolsEnabled === false) throw new Error('Venice chat media tools are disabled') }
      allowed()
      if (input.action === 'catalog') {
        const rows = (await service.catalog()).filter(row => row.model_spec?.voice_changer!==true && ['tts', 'asr', 'video', 'music'].includes(row.type) && (!input.kind || mediaCategory(row) === input.kind) && (input.kind !== 'sound-effects' || isSoundEffectsModel(row)) && (input.kind !== 'music' || !isSoundEffectsModel(row)) && (!input.model || row.id === input.model))
        const visible = rows.filter(row => settings().showOtherModels || settings().mediaModelIds === undefined || settings().mediaModelIds?.includes(row.id))
        return input.model ? visible : visible.map(row => ({ id: row.id, type: row.type, kind: mediaCategory(row), name: row.model_spec?.name, privacy: row.model_spec?.privacy }))
      }
      if (input.action === 'list') return (await service.list()).filter(r => r.sessionId === sessionId).map(summary)
      if (input.action === 'generate' || input.action === 'quote') {
        if (!input.kind || input.kind === 'transcription' || !input.model || (input.action === 'generate' && !input.prompt)) throw new Error('Specify kind, model and prompt')
        const request = { kind: input.kind, model: input.model, prompt: input.prompt || '', options: parseExtraBody(input.extra_json || ''), sessionId, signal: abortSignal }
        if (input.action === 'quote') return service.quote(request)
        if (!await confirm(`Generate ${input.kind} with Venice (${input.model})?\nThis request may incur a cost and sends this content to Venice:\n\n${request.prompt}\n\nParameters: ${input.extra_json || '{}'}`, { action: 'generate', kind: input.kind, model: input.model, options: request.options, prompt:request.prompt, signal:abortSignal })) return { cancelled: true, message: 'The user skipped or cancelled this generation. Do not retry or reopen approval without a new user request.' }
        allowed()
        return summary(await service.start(request))
      }
      const record = (await service.list()).find(r => r.id === input.id && r.sessionId === sessionId)
      if (!record) throw new Error('Media record not found in this chat')
      if (input.action === 'status') return summary(record)
      if (['delete_local', 'cleanup_remote'].includes(input.action)) {
        if (!await confirm(input.action === 'delete_local' ? `Delete generation ${record.id} from this device? The remote copy will remain.` : `Delete generation ${record.id} on Venice?`, { action: input.action as 'delete_local' | 'cleanup_remote', id:record.id, signal:abortSignal })) return { cancelled: true }
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
