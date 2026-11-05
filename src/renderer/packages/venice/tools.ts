import NiceModal from '@ebay/nice-modal-react'
import { buildVeniceMediaTools } from '@shared/providers/definitions/models/venice/tools'
import { buildVeniceImageTools } from '@shared/providers/definitions/models/venice/image-tools'
import { internalVeniceMCP } from '@shared/providers/definitions/models/venice/internal-mcp'
import { ModelProviderEnum } from '@shared/types'
import { veniceConfiguration, veniceMediaService } from './service'
import { providerImageModelsQueryOptions } from '@/packages/image-model-catalog'
import { queryClient } from '@/stores/queryClient'
import { getImageGenerationService, startImageGeneration } from '@/stores/imageGenerationActions'
import { queueImageTaskCompletion, queueImageTaskCompletionError } from '@/packages/chatbox-cli/image-task-follow-up'
import platform from '@/platform'
import { VeniceImageApproval } from '@/components/venice/VeniceImageApproval'
const inFlight = new Map<string, Promise<unknown>>()
export function veniceChatTools(sessionId: string) {
  const options = () => veniceConfiguration().options
  if (options().enabled === false || options().chatToolsEnabled === false || !veniceConfiguration().apiKey) return {}
  const images = async () => queryClient.fetchQuery(providerImageModelsQueryOptions(ModelProviderEnum.Venice, veniceConfiguration()))
  const saved = async (callId: string) => {
    const id = await platform.getStoreValue(`venice:image-call:${sessionId}:${callId}`)
    if (!id) return null
    if (typeof id !== 'string') throw new Error('Metadati della generazione non validi. Non ripetere la richiesta a pagamento.')
    const record = await getImageGenerationService().getRecord(id)
    if (!record || record.source?.sessionId !== sessionId) throw new Error('La generazione precedente non è disponibile. Serve una nuova conferma, senza ripetizione automatica.')
    return { ok: true, command: 'image generate', accepted: true, background: true, recordId: record.id, status: 'pending', startedAt: record.createdAt, wait: { mode: 'callback', managedBy: 'chatbox', modelShouldPoll: false } }
  }
  const imageTools = buildVeniceImageTools({
    models: async () => (await images()).map(row => ({ modelId: row.modelId, name: row.displayName, capabilities: row.capabilities, metadata: row.vendorMetadata })),
    choose: async (request, signal) => NiceModal.show(VeniceImageApproval, { models: await images(), request, signal }),
    previous: saved,
    status: async id => { const record = await getImageGenerationService().getRecord(id); if (!record || record.source?.sessionId !== sessionId) throw new Error('Immagine non trovata in questa chat'); return { recordId: record.id, status: record.status, count: record.generatedImages.length, error: record.error } },
    generate: async (choice, toolCallId) => {
      const key = `${sessionId}:${toolCallId}`; const active = inFlight.get(key); if (active) return active
      const work = (async () => {
        const prior = await saved(toolCallId); if (prior) return prior
        const handle = await startImageGeneration({ prompt: choice.prompt, model: { provider: 'venice', modelId: choice.modelId }, imageGenerateNum: choice.count, aspectRatio: choice.aspectRatio, referenceImages: choice.referenceImages, source: { type: 'chatbox_cli', sessionId, toolCallId } }, { onRecordCreated: record => platform.setStoreValue(`venice:image-call:${sessionId}:${toolCallId}`, record.id) })
        void handle.completion.then(record => { if (record) queueImageTaskCompletion(record, { sessionId, toolCallId }, handle.startedAt) }).catch(error => queueImageTaskCompletionError(handle.recordId, handle.startedAt, { sessionId, toolCallId }, error))
        return saved(toolCallId)
      })()
      inFlight.set(key, work); try { return await work } finally { inFlight.delete(key) }
    },
  }, options)
  const mediaTools = buildVeniceMediaTools(sessionId, veniceMediaService, options, async message => {
    const { default: ConfirmModal } = await import('@/modals/ConfirmModal')
    return await NiceModal.show(ConfirmModal, { title: 'Tool Venice', message }) === true
  })
  return internalVeniceMCP({ ...mediaTools, ...imageTools })
}
