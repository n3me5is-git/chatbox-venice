import type { ProviderSettings } from '../../../../types'
import type { VeniceChatSecurity } from '../../../../types/settings'
import { mergeExtraBody } from '../../../../models/utils/extra-body'
export type VeniceOptions = NonNullable<ProviderSettings['venice']>
export type VeniceProfile = NonNullable<import('../../../../types').ProviderModelInfo['veniceProfile']>
const defined = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, item && typeof item === 'object' && !Array.isArray(item) ? defined(item) : item]))
export function resolveVeniceSettings(base: VeniceOptions = {}, model?: VeniceProfile, session?: VeniceProfile, security?: VeniceChatSecurity): VeniceOptions {
  const id = session?.profileId ?? model?.profileId ?? base.profileId
  const preset = base.profiles?.find(profile => profile.id === id)?.options
  const merged = mergeExtraBody(mergeExtraBody(mergeExtraBody(defined(base), defined(preset || {})), defined(model || {})), defined(session || {}))
  // Only the dedicated user-facing chat security controls can override transport
  // permissions. Model/search profiles and extra request JSON cannot grant them.
  return { ...merged, enabled: base.enabled, audioEnabled: base.audioEnabled, videoEnabled: base.videoEnabled,
    musicEnabled: base.musicEnabled, chatToolsEnabled: base.chatToolsEnabled,
    confirmMediaTools: base.confirmMediaTools,chatToolsVeniceOnly:base.chatToolsVeniceOnly, privacyFilter: base.privacyFilter, textPrivacy: security?.textPrivacy ?? base.textPrivacy,
    showOtherModels: base.showOtherModels, mediaModelIds: base.mediaModelIds,
    e2eeToolsEnabled: security?.e2eeToolsEnabled ?? base.e2eeToolsEnabled, e2eeToolMode: security?.e2eeToolMode ?? base.e2eeToolMode,
    secureReceiptCompatibility: security?.secureReceiptCompatibility ?? base.secureReceiptCompatibility } as VeniceOptions
}
export function assertVeniceEnabled(options: VeniceOptions) {
  if (options.enabled === false) throw new Error('Venice support is disabled in provider settings')
}
