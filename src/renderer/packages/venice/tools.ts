import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import NiceModal from '@ebay/nice-modal-react'
import { buildVeniceMediaTools } from '@shared/providers/definitions/models/venice/tools'
import { buildVeniceImageTools, type ImageChoice } from '@shared/providers/definitions/models/venice/image-tools'
import { internalVeniceMCP } from '@shared/providers/definitions/models/venice/internal-mcp'
import { ModelProviderEnum } from '@shared/types'
import { requestSessionImageChoice } from './image-approval'
import { syncSessionApprovalScope } from './approval-scope'
import { sessionApprovals, type ApprovalMode } from './session-approvals'
import { VeniceMediaApproval } from '@/components/venice/VeniceMediaApproval'
import { veniceConfiguration, veniceMediaService } from './service'
import { providerImageModelsQueryOptions } from '@/packages/image-model-catalog'
import { queryClient } from '@/stores/queryClient'
import { getImageGenerationService, startImageGeneration } from '@/stores/imageGenerationActions'
import { queueImageTaskCompletion, queueImageTaskCompletionError } from '@/packages/chatbox-cli/image-task-follow-up'
import platform from '@/platform'
import { VeniceImageApproval } from '@/components/venice/VeniceImageApproval'
const inFlight = new Map<string, Promise<unknown>>()
export function veniceChatTools(sessionId: string) {
  syncSessionApprovalScope(sessionId)
  const authorizations = new WeakMap<ImageChoice, {scope: string; revision: number; automatic: boolean}>()
  const options = () => veniceConfiguration().options
  if (options().enabled === false || options().chatToolsEnabled === false || !veniceConfiguration().apiKey) return {}
  const images = async () => queryClient.fetchQuery(providerImageModelsQueryOptions(ModelProviderEnum.Venice, veniceConfiguration()))
  const saved = async (callId: string) => {
    const id = await platform.getStoreValue(`venice:image-call:${sessionId}:${callId}`)
    if (!id) return null
    if (typeof id !== 'string') throw new Error(ft("Invalid generation metadata. Do not repeat the paid request."))
    const record = await getImageGenerationService().getRecord(id)
    if (!record || record.source?.sessionId !== sessionId) throw new Error(ft("The previous generation is unavailable. A new approval is required; it will not be retried automatically."))
    return { ok: true, command: 'image generate', accepted: true, background: true, recordId: record.id, status: 'pending', startedAt: record.createdAt, wait: { mode: 'callback', managedBy: 'chatbox', modelShouldPoll: false } }
  }
  const imageTools = buildVeniceImageTools({
    models: async () => (await images()).map(row => ({ modelId: row.modelId, name: row.displayName, capabilities: row.capabilities, metadata: row.vendorMetadata })),
    choose: async (request, signal) => {
      const before = veniceConfiguration(); const scope = syncSessionApprovalScope(sessionId); const models = await images()
      const approved = await requestSessionImageChoice(sessionId, request, models, request => NiceModal.show(VeniceImageApproval, { models, request, signal, sessionId }) as Promise<ImageChoice & {approvalMode?: ApprovalMode} | null>)
      const current = veniceConfiguration()
      if (before.apiKey !== current.apiKey || before.apiHost !== current.apiHost || scope !== syncSessionApprovalScope(sessionId)) throw new Error('Venice settings changed. Review the request again.')
      if (approved) authorizations.set(approved.choice, {scope, revision:sessionApprovals.revision(sessionId), automatic:approved.automatic})
      return approved?.choice || null
    },
    previous: saved,
    status: async id => { const record = await getImageGenerationService().getRecord(id); if (!record || record.source?.sessionId !== sessionId) throw new Error(ft("Image not found in this chat")); return { recordId: record.id, status: record.status, count: record.generatedImages.length, error: record.error } },
    generate: async (choice, toolCallId) => {
      const authorization = authorizations.get(choice)
      if (!authorization || authorization.scope !== syncSessionApprovalScope(sessionId) || (authorization.automatic && authorization.revision !== sessionApprovals.revision(sessionId))) throw new Error('This chat approval was revoked. Review the request again.')
      const key = `${sessionId}:${toolCallId}`; const active = inFlight.get(key); if (active) return active
      const work = (async () => {
        const prior = await saved(toolCallId); if (prior) return prior
        const handle = await startImageGeneration({ prompt: choice.prompt, model: { provider: 'venice', modelId: choice.modelId, ...(choice.extraBody ? { extraBody: choice.extraBody } : {}) }, imageGenerateNum: choice.count, aspectRatio: choice.aspectRatio, referenceImages: choice.referenceImages, source: { type: 'chatbox_cli', sessionId, toolCallId } }, { onRecordCreated: record => platform.setStoreValue(`venice:image-call:${sessionId}:${toolCallId}`, record.id) })
        void handle.completion.then(record => { if (record) queueImageTaskCompletion(record, { sessionId, toolCallId }, handle.startedAt) }).catch(error => queueImageTaskCompletionError(handle.recordId, handle.startedAt, { sessionId, toolCallId }, error))
        return saved(toolCallId)
      })()
      inFlight.set(key, work); try { return await work } finally { inFlight.delete(key) }
    },
  }, options)
  const mediaTools = buildVeniceMediaTools(sessionId, veniceMediaService, options, async (message, request) => {
    const scope = syncSessionApprovalScope(sessionId)
    const descriptor = request?.action === 'generate' ? {tool:'venice_media', kind:request.kind!, model:request.model!, options:request.options || {}} : undefined
    if (descriptor && sessionApprovals.allows(sessionId, descriptor)) return true
    const revision = sessionApprovals.revision(sessionId)
    const result = await NiceModal.show(VeniceMediaApproval, {message, sessionId, generation:!!descriptor}) as {approved:boolean; mode:ApprovalMode}
    if (scope !== syncSessionApprovalScope(sessionId)) throw new Error('Venice settings changed. Review the request again.')
    if (result.approved && descriptor && revision === sessionApprovals.revision(sessionId)) {
      if (result.mode !== sessionApprovals.mode(sessionId)) sessionApprovals.setMode(sessionId,result.mode)
      sessionApprovals.remember(sessionId,descriptor)
    }
    return result.approved
  })
  return internalVeniceMCP({ ...mediaTools, ...imageTools })
}
