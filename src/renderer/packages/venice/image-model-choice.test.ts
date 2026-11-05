import { describe, expect, it } from 'vitest'
import { resolveRequestedVeniceImageModel } from './image-model-choice'
const models = [{ modelId: 'gpt-flare-image', displayName: 'GPT Flare' }, { modelId: 'venice-sd35', displayName: 'Venice SD35' }]
describe('requested image model resolution', () => {
  it('resolves the exact live model name or ID without hardcoded aliases', () => { expect(resolveRequestedVeniceImageModel(models, 'gpt flare').modelId).toBe('gpt-flare-image'); expect(resolveRequestedVeniceImageModel(models, 'GPT-FLARE-IMAGE').modelId).toBe('gpt-flare-image'); expect(resolveRequestedVeniceImageModel(models, 'gptflare').modelId).toBe('gpt-flare-image') })
  it('can preselect a unique catalog name explicitly mentioned in the prompt', () => { expect(resolveRequestedVeniceImageModel(models, undefined, 'Usa GPT Flare per un tramonto').modelId).toBe('gpt-flare-image') })
  it('requires HITL for ambiguous, unknown and unspecified models', () => { expect(resolveRequestedVeniceImageModel([...models, { modelId: 'gpt-flare-edit', displayName: 'GPT Flare' }], 'gpt flare').modelId).toBeUndefined(); expect(resolveRequestedVeniceImageModel(models, 'not available').message).toContain('non è nel catalogo'); expect(resolveRequestedVeniceImageModel(models).modelId).toBeUndefined() })
})
