import { supportsImageReferenceInput } from '@chatbox/core/application/image-generation'
import { acceptsImageReferences, canAutoSelectReferenceModel, sameImageFamily } from '@shared/providers/definitions/models/venice/image-reference-model'
import type { ImageModelGroup } from '@/hooks/useImageModelGroups'
import type { ImageModelSelection } from './model-selection'

export function resolveReferenceSelection(groups: ImageModelGroup[], preferred: ImageModelSelection | null, count: number) {
  const preferredOption = groups.find(group => group.providerId === preferred?.provider)?.models.find(model => model.modelId === preferred?.model)
  if (!count) {
    return { groups, selection: preferred, requiresReference: (preferredOption?.capabilities?.inputReferences?.min ?? 0) > 0 }
  }

  const compatibleGroups = groups.map(group => ({
    ...group,
    models: group.models.filter(option => supportsImageReferenceInput({ provider: group.providerId, modelId: option.modelId }, option.capabilities)
      && (!option.capabilities || acceptsImageReferences(option, count))),
  })).filter(group => group.models.length > 0)
  const provider = compatibleGroups.find(group => group.providerId === preferred?.provider)
  if (!provider || !preferred) {
    return { groups: compatibleGroups, selection: null, requiresReference: false }
  }
  if (provider.models.some(option => option.modelId === preferred.model)) {
    return { groups: compatibleGroups, selection: preferred, requiresReference: false }
  }

  const family = provider.models.filter(option => sameImageFamily(option.modelId, preferred.model))
  const matchingPrivacy = family.find(option => canAutoSelectReferenceModel(preferredOption, option))
  const candidate = matchingPrivacy ?? family[0] ?? provider.models[0]
  const privacyChanged = provider.providerId === 'venice' && !canAutoSelectReferenceModel(preferredOption, candidate)
  const review = !family.length || privacyChanged ? {
    key: JSON.stringify([provider.providerId, preferred.model, candidate.modelId, candidate.vendorMetadata?.privacy, candidate.vendorMetadata?.uncensored]),
    candidate,
    providerLabel: provider.label,
    privacyChanged,
  } : undefined
  return {
    groups: compatibleGroups,
    selection: { provider: provider.providerId, model: candidate.modelId },
    review,
    requiresReference: false,
  }
}
