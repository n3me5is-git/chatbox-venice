import type { SessionSettings } from '@shared/types'

/** Carry model/chat parameters without inheriting root authority, tools, memories or filesystem grants. */
export function workerSessionParameters(settings: SessionSettings): SessionSettings {
  const { temperature, topP, maxTokens, providerOptionsByModel, veniceSecurity, veniceProfile,
    contextTokenLimit, autoCompaction, maxContextMessageCount, subscriptionWebSearch, webBrowsing } = settings
  return { temperature, topP, maxTokens, providerOptionsByModel, veniceSecurity, veniceProfile,
    contextTokenLimit, autoCompaction, maxContextMessageCount, subscriptionWebSearch, webBrowsing }
}
