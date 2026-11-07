export type PrivacyFilter = 'all' | 'private' | 'tee'
export function effectiveTextPrivacy(settings: { textPrivacy?: 'standard' | 'tee' | 'e2ee'; privacyFilter?: PrivacyFilter } = {}) {
  return settings.textPrivacy && settings.textPrivacy !== 'standard' ? settings.textPrivacy : settings.privacyFilter === 'tee' ? 'tee' : 'standard'
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
