import { describe, expect, it } from 'vitest'
import { privacyAllowed, requireModelPrivacy } from './privacy'
import { projectVeniceModels } from './model-selection'
describe('Venice privacy and full-catalog selection', () => {
  it('rejects unknown and anonymized metadata in restricted modes', () => {
    expect(privacyAllowed(undefined)).toBe(true)
    for (const metadata of [undefined, {}, {privacy:'anonymized'}]) { expect(privacyAllowed(metadata,'private')).toBe(false); expect(()=>requireModelPrivacy(metadata,'tee')).toThrow('Privacy Only') }
    expect(privacyAllowed({privacy:'private'},'private')).toBe(true)
    expect(privacyAllowed({privacy:'private'},'tee')).toBe(false)
    expect(privacyAllowed({capabilities:{supportsTeeAttestation:true}},'tee')).toBe(true)
    expect(privacyAllowed({capabilities:{supportsE2EE:true}},'private')).toBe(true)
  })
  it('adds other live models without losing selected profiles and applies privacy afterwards', () => {
    const saved=[{modelId:'a',nickname:'My profile',extraBody:{temperature:0}}]
    const remote=[{modelId:'a',vendorMetadata:{privacy:'private'}},{modelId:'b',vendorMetadata:{privacy:'anonymized'}},{modelId:'c',type:'embedding' as const,vendorMetadata:{privacy:'private'}}]
    expect(projectVeniceModels(saved,remote).map(row=>row.modelId)).toEqual(['a'])
    const all=projectVeniceModels(saved,remote,{showOtherModels:true})
    expect(all.map(row=>row.modelId)).toEqual(['a','b','c']); expect(all[0]).toMatchObject({nickname:'My profile',extraBody:{temperature:0}})
    expect(projectVeniceModels(saved,remote,{showOtherModels:true,privacyFilter:'private'}).map(row=>row.modelId)).toEqual(['a','c'])
    expect(projectVeniceModels(saved,remote).map(row=>row.modelId)).toEqual(['a'])
  })
})
