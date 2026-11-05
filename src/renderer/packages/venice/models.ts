import { useQuery } from '@tanstack/react-query'
import { fetchVeniceModels } from '@shared/providers/definitions/models/venice'
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
  return useQuery({ queryKey: ['venice-models', config?.apiHost, veniceCredentialRevision(config?.apiHost, config?.apiKey)], enabled: !!config?.apiKey && config?.venice?.enabled !== false,
    staleTime: 5 * 60 * 1000, retry: false, queryFn: async () => {
      const models = await fetchVeniceModels({ apiKey: config!.apiKey!, apiHost: config?.apiHost, venice: config?.venice }, await createModelDependencies())
      const state = settingsStore.getState(); const current = state.providers?.venice
      if (current && current.apiKey === config?.apiKey && current?.apiHost === config?.apiHost && current?.venice?.enabled !== false) {
        const saved = current.models || []
        const enriched = saved.length ? saved.map(model => { const remote = models.find(row => row.modelId === model.modelId); return remote ? { ...remote, ...model, vendorMetadata: remote.vendorMetadata, capabilities: remote.capabilities } : model }) : models.filter(model => !current.excludedModels?.includes(model.modelId))
        for (const remote of models) if (remote.type === 'embedding' && !enriched.some(model => model.modelId === remote.modelId) && !current.excludedModels?.includes(remote.modelId)) enriched.push(remote)
        state.setSettings({ providers: { ...state.providers, venice: { ...current, models: enriched } } })
      }
      return models
    } })
}
