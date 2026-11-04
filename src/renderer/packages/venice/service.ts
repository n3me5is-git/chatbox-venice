import { createModelDependencies } from '@/adapters'
import platform from '@/platform'
import { settingsStore } from '@/stores/settingsStore'
import { VeniceMediaService, type MediaRecord, type MediaCatalogCache } from '@shared/providers/definitions/models/venice/media'
const key = 'venice:media:records:v1'
export const veniceConfiguration = () => {
  const provider = settingsStore.getState().getSettings().providers?.venice
  return { apiKey: provider?.apiKey || '', apiHost: provider?.apiHost, options: provider?.venice || {} }
}
export const veniceMediaService = new VeniceMediaService({
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
      const enabled = record.kind === 'video' ? options.videoEnabled : record.kind === 'music' ? options.musicEnabled : options.audioEnabled
      if (!enabled && veniceMediaService.isActive(record.id)) void veniceMediaService.pause(record.id)
    }
  }).catch(() => {})
})
