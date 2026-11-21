import { describe, expect, it } from 'vitest'
import type { ImageModelGroup } from '@/hooks/useImageModelGroups'
import { resolveReferenceSelection } from './reference-selection'

const direct = { modelId: 'family', displayName: 'Family', vendorMetadata: { privacy: 'private', veniceType: 'image' } }
const edit = { modelId: 'family-edit', displayName: 'Family Edit', vendorMetadata: { privacy: 'private', veniceType: 'inpaint' }, capabilities: { aspectRatio: null, inputReferences: { min: 1, max: 2 } } }
const alternative = { ...edit, modelId: 'other-edit', displayName: 'Other Edit', capabilities: { aspectRatio: null, inputReferences: { min: 1, max: 4 } } }
const group = (models: ImageModelGroup['models']): ImageModelGroup => ({ providerId: 'venice', label: 'Venice', models })
const preferred = { provider: 'venice', model: direct.modelId }

describe('image composer model selection', () => {
  it('prioritizes a compatible variant and keeps a manually selected compatible model', () => {
    const catalog = [group([direct, alternative, edit])]
    const resolved = resolveReferenceSelection(catalog, preferred, 2)
    expect(resolved.selection).toEqual({ provider: 'venice', model: edit.modelId })
    expect(resolved.review).toBeUndefined()
    expect(resolved.groups[0].models).toEqual([alternative, edit])
    const manual = { provider: 'venice', model: alternative.modelId }
    expect(resolveReferenceSelection(catalog, manual, 2).selection).toEqual(manual)
    expect(resolveReferenceSelection(catalog, preferred, 0).selection).toEqual(preferred)
    expect(resolveReferenceSelection(catalog, manual, 0).requiresReference).toBe(true)
  })

  it('requires confirmation when only a different family fits the attachment count', () => {
    const resolved = resolveReferenceSelection([group([direct, edit, alternative])], preferred, 3)
    expect(resolved.selection).toEqual({ provider: 'venice', model: alternative.modelId })
    expect(resolved.groups[0].models).toEqual([alternative])
    expect(resolved.review).toMatchObject({ candidate: alternative, privacyChanged: false })
  })

  it('requires confirmation when a same-family variant changes privacy', () => {
    const anonymized = { ...edit, vendorMetadata: { ...edit.vendorMetadata, privacy: 'anonymized' } }
    const resolved = resolveReferenceSelection([group([direct, alternative, anonymized])], preferred, 2)
    expect(resolved.selection?.model).toBe(edit.modelId)
    expect(resolved.review).toMatchObject({ candidate: anonymized, privacyChanged: true })
  })

  it('allows a manual cross-provider selection while excluding providers without the reference protocol', () => {
    const subscription = { providerId: 'openai-sub-unofficial', label: 'ChatGPT Images', models: [alternative] }
    const gemini = { providerId: 'gemini', label: 'Gemini', models: [alternative] }
    const resolved = resolveReferenceSelection([group([direct, edit]), gemini, subscription], preferred, 3)
    expect(resolved.groups).toEqual([subscription])
    expect(resolved.selection).toBeNull()
  })
})
