import type { ProviderModelInfo } from '../../../../types'
import type { VeniceOptions } from './options'
import { privacyAllowed } from './privacy'
export function projectVeniceModels(saved: ProviderModelInfo[], remote: ProviderModelInfo[] | undefined, options: VeniceOptions = {}, excluded: string[] = []) {
  const selected = saved.length ? saved.map(model => {
    const current = remote?.find(row => row.modelId === model.modelId)
    return current ? { ...current, ...model, capabilities: current.capabilities, vendorMetadata: current.vendorMetadata } : model
  }) : (remote || []).filter(model => !excluded.includes(model.modelId))
  const models = options.showOtherModels ? [...selected, ...(remote || []).filter(row => !selected.some(model => model.modelId === row.modelId))] : selected
  return models.filter(model => privacyAllowed(model.vendorMetadata, options.privacyFilter))
}
