import {expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({settings:{providers:{},defaultEmbeddingModel:{provider:'other',model:'existing-default'}} as any}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.settings})}}))
import {defaultRagSettings} from './defaults'
it('honors explicit global defaults and uses private configured Venice only as a fallback',()=>{
 expect(defaultRagSettings()).toMatchObject({provider:'other',model:'existing-default'})
 state.settings.providers.venice={apiKey:'test',models:[{modelId:'anonymous',type:'embedding',vendorMetadata:{privacy:'anonymized'}},{modelId:'private',type:'embedding',vendorMetadata:{privacy:'private'}}]}
 expect(defaultRagSettings()).toMatchObject({provider:'other',model:'existing-default'});delete state.settings.defaultEmbeddingModel
 expect(defaultRagSettings()).toMatchObject({provider:'venice',model:'private'});state.settings.providers.venice.venice={enabled:false};expect(defaultRagSettings().provider).toBe('')
})
