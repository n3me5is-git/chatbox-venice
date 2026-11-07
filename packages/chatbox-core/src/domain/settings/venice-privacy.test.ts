import { expect, it } from 'vitest'
import { veniceSessionTextPrivacy } from './venice-privacy'

it('keeps auxiliary inference on the encrypted conversation model for inherited and chat-only modes', () => {
  const defaults = { providers: { venice: { venice: { textPrivacy: 'e2ee' as const } } } }
  expect(veniceSessionTextPrivacy({ provider: 'venice' }, defaults)).toBe('e2ee')
  expect(veniceSessionTextPrivacy({ provider: 'venice', veniceSecurity: { textPrivacy: 'e2ee' } }, {})).toBe('e2ee')
  expect(veniceSessionTextPrivacy({ provider: 'venice', veniceSecurity: { textPrivacy: 'standard' } }, defaults)).toBe('standard')
  expect(veniceSessionTextPrivacy({ provider: 'venice', veniceSecurity: { textPrivacy: 'standard' } }, { providers: { venice: { venice: { privacyFilter: 'tee' } } } })).toBe('tee')
  expect(veniceSessionTextPrivacy({ provider: 'openai', veniceSecurity: { textPrivacy: 'e2ee' } }, defaults)).toBe('standard')
})
