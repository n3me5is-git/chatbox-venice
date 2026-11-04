import type { ProviderSettings } from '../../../../types'
import { mergeExtraBody } from '../../../../models/utils/extra-body'
export type VeniceOptions = NonNullable<ProviderSettings['venice']>
export type VeniceProfile = NonNullable<import('../../../../types').ProviderModelInfo['veniceProfile']>
const defined = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, item && typeof item === 'object' && !Array.isArray(item) ? defined(item) : item]))
export function resolveVeniceSettings(base: VeniceOptions = {}, model?: VeniceProfile, session?: VeniceProfile): VeniceOptions {
  const id = session?.profileId ?? model?.profileId ?? base.profileId
  const preset = base.profiles?.find(profile => profile.id === id)?.options
  const merged = mergeExtraBody(mergeExtraBody(mergeExtraBody(defined(base), defined(preset || {})), defined(model || {})), defined(session || {}))
  // Permission switches belong to provider settings, never to a model/session override.
  return { ...merged, enabled: base.enabled, audioEnabled: base.audioEnabled, videoEnabled: base.videoEnabled,
    musicEnabled: base.musicEnabled, chatToolsEnabled: base.chatToolsEnabled,
    confirmMediaTools: base.confirmMediaTools } as VeniceOptions
}
export function assertVeniceEnabled(options: VeniceOptions) {
  if (options.enabled === false) throw new Error('Venice support is disabled in provider settings')
}
