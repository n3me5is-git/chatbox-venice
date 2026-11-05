import { describe, expect, it } from 'vitest'
import { getReasoningControlOptions, getReasoningControlLevel, getReasoningProviderOptions } from '@shared/utils/reasoning-control'
const model = { modelId: 'zai-org-glm-5-2', capabilities: ['reasoning' as const], vendorMetadata: { capabilities: { supportsReasoning: true, supportsReasoningEffort: true, reasoningEffortOptions: ['none', 'high', 'max'] } } }
describe('Venice thinking levels', () => {
  it('offers exactly the vendor choices instead of inferring levels from the model name', () => { expect(getReasoningControlOptions('venice', model).map(v => v.level)).toEqual(['default', 'off', 'high', 'max']) })
  it('persists and reads a native max effort without translating it to another provider', () => { const value = getReasoningProviderOptions('venice', model, 'max'); expect(value).toEqual({ openaiCompatible: { reasoningEffort: 'max' } }); expect(getReasoningControlLevel('venice', model, value)).toBe('max'); expect(getReasoningProviderOptions('venice', model, 'medium')).toBeUndefined() })
  it('uses explicit Venice disable thinking for toggle-only models', () => { const toggle = { modelId: 'reasoning', capabilities: ['reasoning' as const] }; expect(getReasoningProviderOptions('venice', toggle, 'off')).toEqual({ openaiCompatible: { enable_thinking: false } }) })
})
