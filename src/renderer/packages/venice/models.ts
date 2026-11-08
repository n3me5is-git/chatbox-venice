import { useQuery } from '@tanstack/react-query'
import { fetchVeniceCatalogModels } from '@shared/providers/definitions/models/venice'
import {mergeVeniceModel} from '@shared/providers/definitions/models/venice/model-selection'
import { createModelDependencies } from '@/adapters'
import { settingsStore, useSettingsStore } from '@/stores/settingsStore'
const identities = new Map<string, { key: string; revision: number }>(); let revision = 0
export function veniceCredentialRevision(host: string | undefined, key: string | undefined) {
  const origin = host || 'https://api.venice.ai/api/v1'; const prior = identities.get(origin)
  if (prior?.key === (key || '')) return prior.revision
  identities.set(origin, { key: key || '', revision: ++revision }); return revision
}
export function useVeniceModels() {
  const config = useSettingsStore(s => s.providers?.venice)
  return useQuery({ queryKey: ['venice-models', config?.apiHost, veniceCredentialRevision(config?.apiHost, config?.apiKey), config?.venice?.privacyFilter], enabled: !!config?.apiKey && config?.venice?.enabled !== false,
    staleTime: 5 * 60 * 1000, retry: false, queryFn: async () => {
      const models = await fetchVeniceCatalogModels({ apiKey: config!.apiKey!, apiHost: config?.apiHost, venice: config?.venice }, await createModelDependencies())
      const state = settingsStore.getState(); const current = state.providers?.venice
      if (current && current.apiKey === config?.apiKey && current?.apiHost === config?.apiHost && current?.venice?.enabled !== false) {
        const saved = current.models || []
        const enriched = saved.length ? saved.map(model => { const remote = models.find(row => row.modelId === model.modelId); return remote ? mergeVeniceModel(model,remote) : model }) : models.filter(model => !current.excludedModels?.includes(model.modelId))
        state.setSettings({ providers: { ...state.providers, venice: { ...current, models: enriched, catalogModels: models } } })
      }
      return models
    } })
}
