import { describe, expect, it } from 'vitest'
import { isSoundEffectsModel, validateMediaRequest } from './media-capabilities'
import fixture from '../../../../../../test/fixtures/venice/music-catalog.json'
describe('separate Venice sound effects catalog', () => {
  it('recognizes the three published effects models without treating short music or narration as SFX', () => {
    expect(fixture.data.filter(isSoundEffectsModel).map(row => row.id).sort()).toEqual(['elevenlabs-sound-effects-v2','mmaudio-v2-text-to-audio','sonilo-v1-1-sound-effects'])
    expect(isSoundEffectsModel({id:'future-song',type:'music',model_spec:{min_duration:1}})).toBe(false)
    expect(isSoundEffectsModel({id:'future-tts',type:'music',model_spec:{voices:['Aria']}})).toBe(false)
  })
  it('uses explicit catalog categories before names and validates SFX before payment', () => {
    expect(isSoundEffectsModel({id:'vendor-new',type:'music',model_spec:{category:'sound_effects'}})).toBe(true)
    expect(isSoundEffectsModel({id:'sound-effects-song',type:'music',model_spec:{category:'music'}})).toBe(false)
    expect(()=>validateMediaRequest('sound-effects',{prompt:'a sound'},{id:'song',type:'music',model_spec:{}})).toThrow('sound-effects model')
  })
})
