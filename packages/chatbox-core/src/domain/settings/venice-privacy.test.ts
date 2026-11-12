import { expect, it } from 'vitest'
import { resolveVeniceTextPrivacy, veniceSessionTextPrivacy } from './venice-privacy'

it('keeps auxiliary inference on the encrypted conversation model for inherited and chat-only modes', () => {
  const defaults = { providers: { venice: { venice: { textPrivacy: 'e2ee' as const } } } }
  expect(veniceSessionTextPrivacy({ provider: 'venice' }, defaults)).toBe('e2ee')
  expect(veniceSessionTextPrivacy({ provider: 'venice', veniceSecurity: { textPrivacy: 'e2ee' } }, {})).toBe('e2ee')
  expect(veniceSessionTextPrivacy({ provider: 'venice', veniceSecurity: { textPrivacy: 'standard' } }, defaults)).toBe('standard')
  expect(veniceSessionTextPrivacy({ provider: 'venice', veniceSecurity: { textPrivacy: 'standard' } }, { providers: { venice: { venice: { privacyFilter: 'tee' } } } })).toBe('tee')
  expect(veniceSessionTextPrivacy({ provider: 'openai', veniceSecurity: { textPrivacy: 'e2ee' } }, defaults)).toBe('standard')
})
it('automatically chooses the strongest actual capability while preserving explicit controls', () => {
  const e2ee={capabilities:{supportsE2EE:true,supportsTeeAttestation:true}},tee={capabilities:{supportsTeeAttestation:true}}
  expect(resolveVeniceTextPrivacy({},e2ee)).toBe('e2ee')
  expect(resolveVeniceTextPrivacy({textPrivacy:'auto'},tee)).toBe('tee')
  expect(resolveVeniceTextPrivacy({},{})).toBe('standard')
  expect(resolveVeniceTextPrivacy({textPrivacy:'standard'},e2ee)).toBe('standard')
  expect(resolveVeniceTextPrivacy({textPrivacy:'tee'},e2ee)).toBe('tee')
  expect(resolveVeniceTextPrivacy({textPrivacy:'e2ee'},{})).toBe('e2ee')
  const global={providers:{venice:{catalogModels:[{modelId:'protected',vendorMetadata:e2ee}]}}}
  expect(veniceSessionTextPrivacy({provider:'venice',modelId:'protected'},global)).toBe('e2ee')
  expect(veniceSessionTextPrivacy({provider:'venice',modelId:'protected',veniceSecurity:{textPrivacy:'standard'}},global)).toBe('standard')
})
