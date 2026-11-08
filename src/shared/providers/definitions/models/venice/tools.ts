import { mediaCategory, supportsMediaKind } from './media-capabilities'
import type { ToolSet } from 'ai'
import { validatedToolSchema } from '../../../../validated-tool-schema'
import { parseExtraBody } from '../../../../models/utils/extra-body'
import type { VeniceMediaService, MediaKind, MediaRecord } from './media'
import type { VeniceOptions } from './options'
type Service = Pick<VeniceMediaService, 'catalog' | 'list' | 'quote' | 'start' | 'resume' | 'pause' | 'remove' | 'cleanup' | 'waitFor'>
export interface MediaApprovalContext { action: 'generate' | 'delete_local' | 'cleanup_remote'; kind?: MediaKind; model?: string; options?: Record<string, unknown>; prompt?:string; id?:string; signal?:AbortSignal }
type Input = { action: 'catalog' | 'list' | 'quote' | 'generate' | 'status' | 'show' | 'wait' | 'resume' | 'pause' | 'delete_local' | 'cleanup_remote'; id?: string; kind?: MediaKind; model?: string; prompt?: string; extra_json?: string; timeout_seconds?: number }
const summary = (r: MediaRecord) => ({ id: r.id, kind: r.kind, model: r.model, status: r.status, createdAt: r.createdAt, text: r.text, error: r.error, remoteCleaned: r.remoteCleaned, localAvailable: !!(r.blobKey || r.text), artifact: { type: 'venice_media', recordId: r.id } })
export function buildVeniceMediaTools(sessionId: string, service: Service, settings: () => VeniceOptions, confirm: (message: string, request?: MediaApprovalContext) => Promise<boolean>): ToolSet {
  if (settings().enabled === false || settings().chatToolsEnabled === false) return {}
  return { venice_media: {
    description: 'Optional Venice media tools for this chat only. Generate speech, video, music or sound-effects (separate kinds); quote video/music; inspect, wait for, show, resume or delete this chat\'s media. Content goes to Venice. Paid generation is never automatically retried. Audio/video are not E2EE. Use catalog for current model IDs, then catalog with the selected model ID to inspect its full supported options before generation. For a queued record use wait with its id (up to 60 seconds); it observes the background job without submitting or restarting it. Use show with an existing id to attach its player card to this reply; playback needs a user click. Never regenerate content to retrieve or play it. Resume an interrupted existing record explicitly. Local deletion does not delete the remote copy. Transcription requires user file selection in Studio.',
    inputSchema: validatedToolSchema({ type: 'object', properties: {
      action: { type: 'string', enum: ['catalog', 'list', 'quote', 'generate', 'status', 'show', 'wait', 'resume', 'pause', 'delete_local', 'cleanup_remote'] },
      timeout_seconds: { type: 'integer', minimum: 0, maximum: 60, description: 'Bounded wait for an existing media record; default 30 seconds. Does not restart generation.' },
      id: { type: 'string' }, kind: { type: 'string', enum: ['speech', 'video', 'music', 'sound-effects'] }, model: { type: 'string' }, prompt: { type: 'string' }, extra_json: { type: 'string', description: 'Optional JSON object with vendor parameters' },
    }, required: ['action'], additionalProperties: false }),
    execute: async (raw, { abortSignal }) => {
      const input = raw as Input
      const allowed = () => { abortSignal?.throwIfAborted(); if (settings().enabled === false || settings().chatToolsEnabled === false) throw new Error('Venice chat media tools are disabled') }
      allowed()
      if (input.action === 'catalog') {
        const rows = (await service.catalog()).filter(row => row.model_spec?.voice_changer!==true && ['tts', 'asr', 'video', 'music'].includes(row.type) && (!input.kind || supportsMediaKind(row,input.kind)) && (!input.model || row.id === input.model))
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
      if (input.action === 'status' || input.action === 'show') return summary(record)
      if (input.action === 'wait') {
        const seconds = input.timeout_seconds ?? 30
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 60) throw new Error('Wait duration must be between 0 and 60 seconds')
        const waited = await service.waitFor(record.id, seconds * 1000, abortSignal)
        allowed()
        const latest = (await service.list()).find(row => row.id === record.id && row.sessionId === sessionId)
        if (!latest || latest.protectedRecord) throw new Error('Media record not found in this chat')
        return { ...summary(latest), waitTimedOut: waited.timedOut, message: waited.timedOut ? 'Still processing. Wait again for this same id; do not submit a new generation.' : latest.status === 'error' ? 'Generation failed. Explain the error to the user and ask before any new paid generation.' : latest.status === 'paused' ? 'Processing is paused. Resume this existing id explicitly; do not generate again.' : 'Generation is ready to open from its artifact card.' }
      }
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
