import type { SessionSettings, Settings } from './settings-schema'

export type VeniceTextPrivacy = 'standard' | 'tee' | 'e2ee'
export function resolveVeniceTextPrivacy(settings: { textPrivacy?: 'auto' | VeniceTextPrivacy; privacyFilter?: 'all' | 'private' | 'tee' } = {}, metadata?: Record<string, unknown>): VeniceTextPrivacy {
  const mode = settings.textPrivacy ?? 'auto'
  if (mode === 'e2ee' || mode === 'tee') return mode
  if (mode === 'auto') {
    const capabilities = metadata?.capabilities as Record<string, unknown> | undefined
    if (capabilities?.supportsE2EE === true) return 'e2ee'
    if (capabilities?.supportsTeeAttestation === true) return 'tee'
  }
  return settings.privacyFilter === 'tee' ? 'tee' : 'standard'
}

/** Resolve only user-owned transport controls, never a model/search profile. */
export function veniceSessionTextPrivacy(
  session: SessionSettings | undefined,
  global: Pick<Settings, 'providers' | 'defaultChatModel'>
): 'standard' | 'tee' | 'e2ee' {
  if ((session?.provider || global.defaultChatModel?.provider) !== 'venice') return 'standard'
  const provider = global.providers?.venice?.venice
  const mode = session?.veniceSecurity?.textPrivacy ?? provider?.textPrivacy ?? 'auto'
  const modelId = session?.modelId || global.defaultChatModel?.model
  const configured = global.providers?.venice
  const model = [...(configured?.catalogModels || []), ...(configured?.models || [])].find(model => model.modelId === modelId)
  return resolveVeniceTextPrivacy({ textPrivacy: mode, privacyFilter: provider?.privacyFilter }, model?.vendorMetadata)
}
