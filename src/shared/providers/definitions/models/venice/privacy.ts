export type PrivacyFilter = 'all' | 'private' | 'tee'
import { resolveVeniceTextPrivacy as effectiveTextPrivacy } from '@chatbox/core/domain/settings/venice-privacy'
import type { VeniceOptions } from './options'
export { effectiveTextPrivacy }
export function modelPrivacySettings(settings: VeniceOptions = {}, metadata?: Record<string, unknown>): VeniceOptions {
  const mode = effectiveTextPrivacy(settings, metadata)
  return { ...settings, textPrivacy: mode, e2eeToolsEnabled: settings.e2eeToolsEnabled ?? ((settings.textPrivacy ?? 'auto') === 'auto' && mode === 'e2ee') }
}
export function supportsTee(metadata?: Record<string, unknown>) {
  const caps = metadata?.capabilities as Record<string, unknown> | undefined
  return caps?.supportsTeeAttestation === true || caps?.supportsE2EE === true
}
export function privacyAllowed(metadata: Record<string, unknown> | undefined, filter: PrivacyFilter = 'all') {
  if (filter === 'all') return true
  if (filter === 'tee') return supportsTee(metadata)
  return metadata?.privacy === 'private' || supportsTee(metadata)
}
export function requireModelPrivacy(metadata: Record<string, unknown> | undefined, filter: PrivacyFilter = 'all') {
  if (!privacyAllowed(metadata, filter)) throw new Error('This model is blocked by your Venice Privacy Only setting. Refresh the catalog or choose an allowed model.')
}
