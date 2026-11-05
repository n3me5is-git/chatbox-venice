import { createModelDependencies } from '@/adapters'
import platform from '@/platform'
import { settingsStore } from '@/stores/settingsStore'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { VeniceMediaService, type MediaRecord, type MediaCatalogCache, type VoiceHandle } from '@shared/providers/definitions/models/venice/media'
const key = 'venice:media:records:v1'
export const veniceConfiguration = () => {
  const provider = settingsStore.getState().getSettings().providers?.venice
  return { apiKey: provider?.apiKey || '', apiHost: provider?.apiHost, options: provider?.venice || {} }
}
export const veniceMediaService = new VeniceMediaService({
  ensureStorage:process.env.NODE_ENV==='test'?undefined:async()=>{if(platform.type!=='web'&&!await vaultRuntimeFor(platform).available())throw new Error('Device encryption is unavailable. Configure a secure device screen lock before generating media.')},
  putStream: process.env.NODE_ENV === 'test' ? undefined : (id,response,mime,signal)=>vaultRuntimeFor(platform).putStream(id,response,mime,signal),
  readVoices: async () => (await platform.getStoreValue('venice:voice-handles:v1') || []) as VoiceHandle[],
  writeVoices: voices => platform.setStoreValue('venice:voice-handles:v1', voices),
  readCatalog: async () => await platform.getStoreValue('venice:media:catalog:v1') as MediaCatalogCache | null,
  writeCatalog: cache => platform.setStoreValue('venice:media:catalog:v1', cache),
  read: async () => { const records = await platform.getStoreValue(key); return Array.isArray(records) ? records as MediaRecord[] : [] },
  write: records => platform.setStoreValue(key, records),
  putBlob: (id, data) => platform.setStoreBlob(id, data),
  getBlob: id => platform.getStoreBlob(id),
  deleteBlob: id => platform.delStoreBlob(id),
}, veniceConfiguration, async request => (await createModelDependencies()).request.apiRequest(request))
settingsStore.subscribe(() => {
  const options = veniceConfiguration().options
  if (options.enabled === false) veniceMediaService.pauseAll()
  else void veniceMediaService.list().then(records => {
    for (const record of records) {
      const enabled = record.kind === 'video' ? options.videoEnabled : (record.kind === 'music' || record.kind === 'sound-effects') ? options.musicEnabled : options.audioEnabled
      if (!enabled && veniceMediaService.isActive(record.id)) void veniceMediaService.pause(record.id)
    }
  }).catch(() => {})
})
