import {beforeEach,expect,it,vi} from 'vitest'
import {tool} from 'ai'
import {z} from 'zod'
import {createMessage} from '@shared/types'
import {LocalMCPApplicationSchema,defaultLocalMCPPermissions,type LocalMCPGrant} from '@shared/local-mcp'
const state=vi.hoisted(()=>({chat:vi.fn(),insert:vi.fn(),update:vi.fn(),approve:vi.fn(),source:{} as any,revision:1,readBlob:vi.fn(),settings:{provider:'venice',modelId:'secure',agentMode:{value:'on'}} as any}))
vi.mock('@chatbox/core/generation',()=>({withSessionGenerationLock:async(_id:string,work:Function)=>work()}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessions:{getSessionContextSource:async()=>state.source,getSessionHeader:async()=>({header:{id:'root'},revision:state.revision}),insertMessages:(...args:any[])=>state.insert(...args),updateMessage:(...args:any[])=>state.update(...args)},generationRuntime:{acquireGenerationPreparationLease:()=>({}),releaseGenerationPreparationLease:vi.fn()}}}))
vi.mock('@/adapters',()=>({createModel:async()=>({chat:state.chat,isSupportVision:()=>true})}))
vi.mock('@/adapters/CurrentBlobStorage',()=>({currentBlobStorage:{get:state.readBlob}}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({projects:{assertLibraryKey:vi.fn()}})}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>({providers:{}})})}}))
vi.mock('@/packages/model-calls/message-utils',()=>({convertToModelMessages:async(messages:any[],options:any)=>({messages,vision:options.modelSupportVision})}))
vi.mock('@/packages/multi-agent/worker-context',()=>({createWorkerContext:async()=>({prepare:async(messages:any)=>messages})}))
vi.mock('./backend',()=>({localMCPSettings:async()=>state.settings,localMCPModelCatalog:async()=>[{provider:'venice',modelId:'secure'}],localMCPTools:async()=>[{name:'session_file',inputSchema:{type:'object'}},{name:'session_js',inputSchema:{type:'object'}},{name:'venice_image',inputSchema:{type:'object'}}],handleSessionLocalMCP:vi.fn()}))
vi.mock('./model-approval',()=>({requestExternalModelApproval:(...args:any[])=>state.approve(...args)}))
import {applicationConversationTool} from './conversation'
const grant=():LocalMCPGrant=>({running:true,sessionId:'application',endpointId:crypto.randomUUID(),application:LocalMCPApplicationSchema.parse({mode:'full',name:'Agent',conversations:true}),permissions:{...defaultLocalMCPPermissions,readFiles:false,models:true},url:'http://127.0.0.1:1/mcp',token:'test',startedAt:1})
async function run(g=grant()){
 const member=applicationConversationTool(g,new AbortController().signal,async()=>{},async(_id,_input,work)=>work()),{asSchema}=await import('ai')
 const input=await asSchema(member.inputSchema).validate!({action:'send',sessionId:'root',text:'Continue',request_id:'one'});if(!input.success)throw Error('Invalid input');return member.execute!(input.value,{toolCallId:'test',messages:[],context:{}})
}
beforeEach(()=>{vi.clearAllMocks();state.revision=1;state.settings={provider:'venice',modelId:'secure',agentMode:{value:'on'}};state.source={candidateMessages:[createMessage('system','Preserve the current branch policy'),createMessage('user','Earlier active message')],compactionPoints:[],revision:1};state.approve.mockResolvedValue(true);state.chat.mockResolvedValue({contentParts:[{type:'text',text:'Done'}],finishReason:'stop'});state.insert.mockResolvedValue(undefined);state.update.mockResolvedValue(undefined)})
it('uses the causal context and does not expose files, vision or execution outside the endpoint grant',async()=>{
 expect(await run()).toMatchObject({finishReason:'stop'})
 expect(state.chat.mock.calls[0][0].messages.map((message:any)=>message.contentParts?.[0]?.text).join(' ')).toContain('Preserve the current branch policy')
 expect(state.chat.mock.calls[0][0].vision).toBe(false);expect(Object.keys(state.chat.mock.calls[0][1].tools)).toEqual([]);expect(state.readBlob).not.toHaveBeenCalled()
 expect(state.insert).toHaveBeenCalledWith('root',expect.arrayContaining([expect.objectContaining({role:'user',contentParts:[{type:'text',text:'[MCP: Agent]\nContinue'}]})]))
})
it('does not send after denial or a conversation revision change during approval',async()=>{
 state.approve.mockResolvedValue(false);await expect(run()).rejects.toThrow('not approved');expect(state.chat).not.toHaveBeenCalled()
 state.approve.mockImplementation(async()=>{state.revision=2;return true});await expect(run()).rejects.toThrow('changed');expect(state.insert).not.toHaveBeenCalled()
})
