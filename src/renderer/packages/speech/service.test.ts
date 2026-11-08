import { beforeEach, expect, it, vi } from 'vitest'
import { createDefaultSettings } from '@chatbox/core/domain/settings'
import { SettingsSchema } from '@shared/types'
import { speechBinding } from '@shared/speech'
const state=vi.hoisted(()=>({settings:{} as any,header:vi.fn(),project:vi.fn(),sessionSettings:vi.fn(),request:vi.fn()}))
vi.mock('@shared/defaults',async()=>{const {ModelProviderType}=await import('@shared/types');return {SystemProviders:()=>[{id:'venice',type:ModelProviderType.OpenAI,defaultSettings:{apiHost:'https://api.venice.ai/api/v1'}}]}})
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.settings})}}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessions:{getSessionHeader:state.header}}}))
vi.mock('@/stores/session/session-settings',()=>({getSessionSettings:state.sessionSettings}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({projects:{assertSession:state.project}})}))
vi.mock('@/platform',()=>({default:{type:'web'}}))
vi.mock('@/adapters',()=>({createModelDependencies:async()=>({request:{apiRequest:state.request}})}))
import { speechClient } from './service'
const context={sessionId:'new',selected:{provider:'venice',modelId:'private-chat'}}
beforeEach(async()=>{
  vi.clearAllMocks();state.header.mockResolvedValue(null);state.project.mockResolvedValue(undefined)
  state.request.mockImplementation(async()=>Response.json({text:'An editable new-chat draft'}))
  state.settings=SettingsSchema.parse({...createDefaultSettings(),defaultASRModel:{provider:'venice',model:'asr-test'},providers:{venice:{apiKey:'SYNTHETIC_SPEECH_KEY',apiHost:'https://api.venice.ai/api/v1',venice:{enabled:true,audioEnabled:true},models:[{modelId:'private-chat',type:'chat',vendorMetadata:{privacy:'private'}}]}},speechCatalog:[{provider:'venice',model:'asr-test',kind:'asr',name:'ASR',binding:await speechBinding('venice','https://api.venice.ai/api/v1','SYNTHETIC_SPEECH_KEY'),metadata:{privacy:'private'}}]})
})
it.each(['new',undefined])('transcribes into an unsaved composer (%s) without requiring a persisted chat',async sessionId=>{
  const text=await speechClient.transcribe({...context,sessionId},new File(['audio'],'recording.wav',{type:'audio/wav'}),new AbortController().signal,vi.fn())
  expect(text).toBe('An editable new-chat draft');expect(state.request).toHaveBeenCalledTimes(1)
  expect(state.header).not.toHaveBeenCalled();expect(state.project).not.toHaveBeenCalled();expect(state.sessionSettings).not.toHaveBeenCalled()
})
it('still blocks deleted and protected saved chats before any speech request',async()=>{
  await expect(speechClient.check('asr',{...context,sessionId:'deleted'})).rejects.toThrow('no longer available')
  expect(state.project).toHaveBeenCalledWith('deleted');expect(state.header).toHaveBeenCalledWith('deleted')
  state.project.mockRejectedValueOnce(Error('Project locked'))
  await expect(speechClient.check('asr',{...context,sessionId:'protected'})).rejects.toThrow('Project locked')
  expect(state.request).not.toHaveBeenCalled()
})
it('preserves private-model refusal for unsaved chats',async()=>{
  state.settings.speechCatalog[0].metadata={privacy:'anonymous'}
  await expect(speechClient.check('asr',context)).rejects.toThrow('chat is private')
  expect(state.request).not.toHaveBeenCalled()
})
it('requires E2EE consent in an unsaved chat before sending its recording',async()=>{
  state.settings.providers.venice.models[0].vendorMetadata.capabilities={supportsE2EE:true}
  const confirm=vi.fn(async()=>false)
  await expect(speechClient.transcribe(context,new File(['audio'],'recording.wav'),new AbortController().signal,confirm)).rejects.toMatchObject({name:'AbortError'})
  expect(confirm).toHaveBeenCalledTimes(1);expect(state.request).not.toHaveBeenCalled()
})
