import {expect,it} from 'vitest'
import {LocalMCPApplicationSchema} from './local-mcp'
import {localMCPModelSettings} from './local-mcp-model-policy'
const providers={venice:{models:[{modelId:'e2ee',vendorMetadata:{capabilities:{supportsE2EE:true}}},{modelId:'tee',vendorMetadata:{capabilities:{supportsTeeAttestation:true}}}]}}
it('prevents workers or guardians from routing around the endpoint provider allowlist',()=>{
 const application=LocalMCPApplicationSchema.parse({mode:'shadow',name:'Venice',providers:['venice']})
 expect(()=>localMCPModelSettings(application,{provider:'openai',modelId:'worker'},providers as any)).toThrow('outside')
 expect(localMCPModelSettings(application,{provider:'venice',modelId:'e2ee'},providers as any)).toMatchObject({provider:'venice'})
})
it('applies the minimum transport to worker and guardian parameters without allowing a plain override',()=>{
 const application=LocalMCPApplicationSchema.parse({mode:'shadow',name:'Secure',privacy:'e2ee'})
 expect(localMCPModelSettings(application,{provider:'venice',modelId:'e2ee',veniceSecurity:{textPrivacy:'standard'}},providers as any)).toMatchObject({veniceSecurity:{textPrivacy:'e2ee',e2eeToolsEnabled:true,e2eeToolMode:'encrypted-text'}})
 expect(()=>localMCPModelSettings(application,{provider:'venice',modelId:'tee'},providers as any)).toThrow('privacy requirement')
 application.privacy='tee';expect(localMCPModelSettings(application,{provider:'venice',modelId:'e2ee'},providers as any).veniceSecurity?.textPrivacy).toBe('e2ee')
})
