import { expect, it, vi, beforeEach } from 'vitest'
import type { ModelDependencies } from '../../../../types/adapters'
import Venice, { createVeniceFetch } from '../venice'
import { modelPrivacySettings } from './privacy'
const {secure}=vi.hoisted(()=>({secure:vi.fn()}))
vi.mock('./secure-chat',()=>({secureVeniceChat:secure}))
const model={modelId:'encrypted',type:'chat' as const,vendorMetadata:{privacy:'private',capabilities:{supportsE2EE:true}}}
const plain=vi.fn(async()=>Response.json({choices:[]}))
const dependencies={request:{apiRequest:vi.fn()},getRemoteConfig:()=>({}),sentry:{withScope:vi.fn(),captureException:vi.fn()}} as unknown as ModelDependencies
beforeEach(()=>{vi.clearAllMocks();secure.mockImplementation(async(_fetch,_url,_init,body)=>{
 const text=body.messages.at(-1).content,compat=String(text).includes('compatible')
 const frame={id:'chatcmpl-test',object:'chat.completion.chunk',created:1,model:'encrypted',choices:[{index:0,delta:{content:'Answer '+text},finish_reason:null}]}
 const finish={...frame,choices:[{index:0,delta:{},finish_reason:'stop'}]}
 return new Response('data: '+JSON.stringify(frame)+'\n\ndata: '+JSON.stringify(finish)+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream','X-Chatbox-Secure-Receipt':compat?'gateway-signature-only':'payload-bound'}})
})})
it('chooses E2EE automatically, retaining already granted tools with encrypted definitions',()=>{
 const instance=new Venice({apiKey:'synthetic',apiHost:'https://api.venice.ai/api/v1',model,customFetch:plain},dependencies)
 expect(instance.options.venice).toMatchObject({textPrivacy:'e2ee',e2eeToolsEnabled:true})
 expect(instance.isSupportToolUse('agent')).toBe(true)
 expect(modelPrivacySettings({e2eeToolsEnabled:false},model.vendorMetadata).e2eeToolsEnabled).toBe(false)
 expect(modelPrivacySettings({textPrivacy:'standard'},model.vendorMetadata).textPrivacy).toBe('standard')
})
it('does not downgrade or emit successful evidence after attestation failure',async()=>{
 secure.mockRejectedValueOnce(Error('Invalid attestation'))
 const verified=vi.fn(),fetch=createVeniceFetch(plain,{},undefined,model,verified)
 await expect(fetch('https://api.venice.ai/api/v1/chat/completions',{body:JSON.stringify({model:model.modelId,messages:[{role:'user',content:'Question'}]})})).rejects.toThrow('Invalid attestation')
 expect(plain).not.toHaveBeenCalled();expect(verified).not.toHaveBeenCalled()
})
it('keeps verified receipt evidence scoped to simultaneous calls on the same model instance',async()=>{
 const instance=new Venice({apiKey:'synthetic',apiHost:'https://api.venice.ai/api/v1',model,customFetch:plain},dependencies)
 const first=vi.fn(),second=vi.fn()
 const collect=async(text:string,callback:typeof first)=>{const events=[];for await(const part of instance.chatStream([{role:'user',content:text}],{onSecurityVerification:callback}))events.push(part);return events}
 const [a,b]=await Promise.all([collect('strict',first),collect('compatible',second)])
 expect(first).toHaveBeenCalledOnce();expect(second).toHaveBeenCalledOnce()
 expect(first.mock.calls[0][0].receipt).toBe('payload-bound');expect(second.mock.calls[0][0].receipt).toBe('gateway-signature-only')
 expect(a.find(event=>event.type==='security-verification')).toMatchObject({evidence:{responses:1,receipt:'payload-bound'}})
 expect(b.find(event=>event.type==='security-verification')).toMatchObject({evidence:{responses:1,receipt:'gateway-signature-only'}})
})
