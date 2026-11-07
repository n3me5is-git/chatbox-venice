import type { SessionSettings, Settings } from './settings-schema'

/** Resolve only user-owned transport controls, never a model/search profile. */
export function veniceSessionTextPrivacy(
  session: SessionSettings | undefined,
  global: Pick<Settings, 'providers' | 'defaultChatModel'>
): 'standard' | 'tee' | 'e2ee' {
  if ((session?.provider || global.defaultChatModel?.provider) !== 'venice') return 'standard'
  const provider = global.providers?.venice?.venice
  const mode = session?.veniceSecurity?.textPrivacy ?? provider?.textPrivacy ?? 'standard'
  return mode !== 'standard' ? mode : provider?.privacyFilter === 'tee' ? 'tee' : 'standard'
}
