import { expect,it } from 'vitest'
import { SettingsSchema } from '@chatbox/core/domain/settings/settings-schema'
import { createDefaultSettings } from '@chatbox/core/domain/settings'
import { chatSpeechPrivacy,speechPrivacyDecision,speechBinding,speechModelKind } from './speech'
it('blocks unclassified/anonymous speech in private and E2EE chats, allowing only an explicit private downgrade for E2EE',()=>{
  for(const metadata of [undefined,{privacy:'anonymous'},{privacy:'public'}])for(const privacy of ['private','e2ee'] as const)expect(speechPrivacyDecision(privacy,metadata)).toBe('block')
  expect(speechPrivacyDecision('private',{privacy:'private'})).toBe('allow')
  expect(speechPrivacyDecision('e2ee',{privacy:'private'})).toBe('confirm')
  expect(speechPrivacyDecision('e2ee',{capabilities:{supportsE2EE:true}})).toBe('confirm')
  expect(speechPrivacyDecision('standard',undefined)).toBe('allow')
})
it('resolves privacy from the current model and per-chat settings, preserving explicit provider defaults',()=>{
  const settings=SettingsSchema.parse({...createDefaultSettings(),providers:{venice:{venice:{textPrivacy:'e2ee'},models:[{modelId:'private',vendorMetadata:{privacy:'private'}}]}},defaultChatModel:{provider:'venice',model:'private'}})
  expect(chatSpeechPrivacy(settings)).toBe('e2ee')
  expect(chatSpeechPrivacy(settings,{provider:'venice',modelId:'private',veniceSecurity:{textPrivacy:'standard'}} as any)).toBe('private')
  expect(chatSpeechPrivacy(settings,undefined,{provider:'openai',modelId:'other'})).toBe('standard')
})
it('keeps global speech settings through schema parsing and does not silently choose a paid model',async()=>{
  const parsed=SettingsSchema.parse({...createDefaultSettings(),defaultASRModel:{provider:'venice',model:'asr'},defaultTTSModel:{provider:'openai',model:'tts-1'},speechOptions:{voice:'alloy',speed:1.2},speechCatalog:[{provider:'venice',model:'asr',kind:'asr',name:'ASR',binding:'fingerprint',metadata:{privacy:'private'}}]})
  expect(parsed.defaultASRModel?.model).toBe('asr');expect(parsed.defaultTTSModel?.model).toBe('tts-1');expect(parsed.speechCatalog?.[0].metadata?.privacy).toBe('private')
  expect(SettingsSchema.parse(createDefaultSettings()).defaultTTSModel).toBeUndefined()
  expect(await speechBinding('venice','https://api.venice.ai/api/v1','one')).not.toBe(await speechBinding('venice','https://api.venice.ai/api/v1','two'))
})
it('does not confuse music or chat models with synchronous speech models',()=>{
  expect(speechModelKind({id:'openai/whisper-large-v3'})).toBe('asr');expect(speechModelKind({id:'gpt-4o-mini-tts'})).toBe('tts')
  expect(speechModelKind({id:'tts-special',type:'music'})).toBeUndefined()
  expect(speechModelKind({id:'music-model',type:'music'})).toBeUndefined();expect(speechModelKind({id:'gpt-4o'})).toBeUndefined()
})
