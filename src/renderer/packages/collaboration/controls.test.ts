import { expect,it } from 'vitest'
import { sharedControls,sharedSettingsPatch } from './controls'
import { SharedControlPatchSchema } from '@shared/collaboration'
const model={modelId:'glm-private',nickname:'GLM',capabilities:['reasoning' as const],vendorMetadata:{capabilities:{supportsReasoningEffort:true,reasoningEffortOptions:['low','medium','high']}}}
it('publishes only current host controls and retains unrelated security, provider and MCP settings',()=>{
  const settings={provider:'venice',modelId:model.modelId,veniceSecurity:{textPrivacy:'e2ee' as const,e2eeToolsEnabled:true},temperature:0.7,veniceProfile:{imageSafeMode:true}}
  const controls={...sharedControls(settings,model,true,{webSearch:'auto',searchProvider:'brave'}),revision:'rev'}
  expect(controls).toMatchObject({model:'GLM',thinking:'default',thinkingOptions:['default','low','medium','high'],webBrowsing:true,venice:{webSearch:'auto',searchProvider:'brave'}})
  const patch=sharedSettingsPatch(settings,model,controls,{thinking:'high',venice:{searchProvider:'google'},webBrowsing:false})
  expect(patch).toMatchObject({providerOptionsByModel:{'venice:glm-private':{openaiCompatible:{reasoningEffort:'high'}}},veniceProfile:{imageSafeMode:true,searchProvider:'google'},webBrowsing:false})
  expect(patch).not.toHaveProperty('provider');expect(patch).not.toHaveProperty('veniceSecurity');expect(patch).not.toHaveProperty('temperature')
  expect(JSON.stringify(controls)).not.toContain('e2eeToolsEnabled')
})
it('rejects unsupported thinking and attempts to change models, MCP or security',()=>{
  const settings={provider:'venice',modelId:model.modelId},controls={...sharedControls(settings,model,false),revision:'rev'}
  expect(()=>sharedSettingsPatch(settings,model,controls,{thinking:'max'})).toThrow('unavailable')
  for(const key of ['modelId','provider','mcpServers','veniceSecurity','apiKey'])expect(SharedControlPatchSchema.safeParse({[key]:'forged'}).success).toBe(false)
  expect(SharedControlPatchSchema.safeParse({venice:{textPrivacy:'off'}}).success).toBe(false)
})
it('exposes subscription native search independently from Chatbox search',()=>{
  const settings={provider:'openai-sub-unofficial',modelId:'gpt-6-astra'},controls={...sharedControls(settings,{modelId:'gpt-6-astra'},false,{},true),revision:'rev'}
  expect(controls.subscriptionWebSearch).toBe(true);expect(controls.webBrowsing).toBe(false);expect(controls.venice).toBeUndefined()
  expect(sharedSettingsPatch(settings,null,controls,{subscriptionWebSearch:false})).toEqual({subscriptionWebSearch:false})
})
