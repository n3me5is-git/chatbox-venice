import {describe,expect,it} from 'vitest'
import {parseVeniceBalance} from './balance'
import {mediaCategory} from './media-capabilities'
describe('Venice account and media catalog regression cases',()=>{
 it('reads inference-key balances, including zero and decimal strings',()=>{expect(parseVeniceBalance({data:{balances:{USD:'1.25',DIEM:0}}})).toEqual({USD:1.25,DIEM:0});expect(parseVeniceBalance({balances:{usd:0,diem:'3.5'}})).toEqual({USD:0,DIEM:3.5})})
 it('does not invent a zero balance when the endpoint returns no amounts',()=>{expect(()=>parseVeniceBalance({data:{}})).toThrow();expect(()=>parseVeniceBalance({balances:{USD:null,DIEM:''}})).toThrow()})
 it('classifies queued ElevenLabs and Seed voices separately from music and effects',()=>{expect(mediaCategory({id:'elevenlabs-tts-v4',type:'music',model_spec:{voices:['Aria']}})).toBe('speech');expect(mediaCategory({id:'seed-audio-1-0',type:'music',model_spec:{voices:['Tim'],supports_lyrics:false}})).toBe('speech');expect(mediaCategory({id:'elevenlabs-music-v2',type:'music'})).toBe('music');expect(mediaCategory({id:'elevenlabs-sound-effects-v2',type:'music'})).toBe('sound-effects');expect(mediaCategory({id:'converter',type:'music',model_spec:{voice_changer:true,voices:['Aria']}})).toBe('voice-conversion')})
})
