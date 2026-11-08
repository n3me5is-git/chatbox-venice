import type { ProviderModelInfo } from '../../../../types'
import type { VeniceOptions } from './options'
import { privacyAllowed } from './privacy'
/** User labels/options survive refreshes; provider facts always come from the live catalog. */
export function mergeVeniceModel(saved:ProviderModelInfo,current:ProviderModelInfo):ProviderModelInfo{return {...current,...saved,type:current.type,capabilities:current.capabilities,vendorMetadata:current.vendorMetadata}}
export function projectVeniceModels(saved: ProviderModelInfo[], remote: ProviderModelInfo[] | undefined, options: VeniceOptions = {}, excluded: string[] = []) {
  const selected = saved.length ? saved.map(model => {
    const current = remote?.find(row => row.modelId === model.modelId)
    return current ? mergeVeniceModel(model,current) : model
  }) : (remote || []).filter(model => !excluded.includes(model.modelId))
  const models = options.showOtherModels ? [...selected, ...(remote || []).filter(row => !selected.some(model => model.modelId === row.modelId))] : selected
  return models.filter(model => privacyAllowed(model.vendorMetadata, options.privacyFilter))
}
