import { beforeEach,expect,it,vi } from 'vitest'
import { tool } from 'ai'
import { z } from 'zod'
import type { LocalMCPGrant,LocalMCPRequest } from '@shared/local-mcp'
import { defaultLocalMCPPermissions,sessionResourceURI } from '@shared/local-mcp'
const state=vi.hoisted(()=>({settings:{} as any,session:{} as any,locked:false,chat:vi.fn(),approve:vi.fn(),execute:vi.fn(),read:vi.fn(),metadata:vi.fn()}))
vi.mock('@shared/defaults',()=>({SystemProviders:()=>[{id:'venice',name:'Venice'},{id:'openai',name:'OpenAI'}]}))
vi.mock('@/adapters',()=>({createModel:vi.fn(async()=>({chat:state.chat}))}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessions:{getSessionHeader:async()=>({id:'chat'})}}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.settings})}}))
vi.mock('@/stores/session/session-settings',()=>({getSessionSettings:async()=>state.session}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({projects:{assertSession:async()=>{if(state.locked)throw Error('Locked')}}})}))
vi.mock('@/packages/session-resources/files',()=>({sessionFiles:{index:async()=>({toolsEnabled:true})}}))
vi.mock('@/packages/session-resources/tools',()=>({buildSessionWorkspaceTools:async()=>({session_file:tool({inputSchema:z.object({action:z.enum(['list','read','write','delete']),path:z.string().optional()}).strict(),execute:state.execute})})}))
vi.mock('@/packages/session-resources/service',()=>({listSessionResources:async()=>({items:[{id:'file-one',path:'report.md',name:'report.md',origin:'file',mime:'text/markdown'}]}),readSessionResource:state.read}))
vi.mock('@/packages/venice/tools',()=>({veniceChatTools:()=>({})}))
vi.mock('@/packages/mcp/controller',()=>({mcpController:{servers:new Map(),getAvailableTools:()=>({})}}))
vi.mock('@/packages/model-calls/toolsets/web-search',()=>({buildWebSearchTools:()=>({web_search:{}}),parseLinkTool:{}}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('./model-approval',()=>({requestExternalModelApproval:(...args:any[])=>state.approve(...args)}))
import { handleLocalMCP,localMCPTools } from './backend'
const grant=():LocalMCPGrant=>({running:true,sessionId:'chat',url:'http://127.0.0.1:31337/mcp',token:'local-client-token',startedAt:1,permissions:{...defaultLocalMCPPermissions,models:true}})
const request=(operation:LocalMCPRequest['operation'],extra:Partial<LocalMCPRequest>={}):LocalMCPRequest=>({id:'one',grant:grant(),operation,...extra})
const signal=()=>new AbortController().signal
beforeEach(()=>{
  vi.clearAllMocks();state.locked=false;state.session={provider:'venice',modelId:'secure',veniceSecurity:{textPrivacy:'e2ee'}}
  state.settings={providers:{venice:{apiKey:'SENTINEL_PROVIDER_KEY',venice:{enabled:true},models:[{modelId:'ordinary',displayName:'Ordinary',type:'chat',vendorMetadata:{privacy:'private'}},{modelId:'secure',displayName:'Secure',type:'chat',vendorMetadata:{privacy:'private',capabilities:{supportsE2EE:true}}}]},openai:{apiKey:'SECOND_PROVIDER_KEY',models:[{modelId:'other',type:'chat'}]}}}
  state.chat.mockResolvedValue({contentParts:[{type:'text',text:'Model response'}],usage:{inputTokens:3,outputTokens:2}});state.approve.mockResolvedValue(true);state.read.mockResolvedValue({bytes:new TextEncoder().encode('# Private file')})
})
it('lists only privacy-compatible models and never exposes provider credentials',async()=>{
  const output=await handleLocalMCP(request('call_tool',{name:'app_models',arguments:{}}),signal())
  expect((output as any[]).map(model=>model.modelId)).toEqual(['secure']);expect(JSON.stringify(output)).not.toContain('PROVIDER_KEY')
})
it('enforces approval for a real model call and rejects model/provider downgrade and extra arguments',async()=>{
  const input={provider:'venice',modelId:'secure',messages:[{role:'user',content:'Read these explicit messages only'}],maxOutputTokens:20}
  state.approve.mockResolvedValue(false)
  await expect(handleLocalMCP(request('call_tool',{name:'app_model',arguments:input}),signal())).rejects.toThrow('approved');expect(state.chat).not.toHaveBeenCalled()
  state.approve.mockResolvedValue(true)
  expect(await handleLocalMCP(request('call_tool',{name:'app_model',arguments:input}),signal())).toMatchObject({text:'Model response',usage:{inputTokens:3,outputTokens:2}})
  expect(state.chat).toHaveBeenCalledWith(input.messages,expect.objectContaining({sessionId:'chat',maxSteps:1}))
  await expect(handleLocalMCP(request('call_tool',{name:'app_model',arguments:{...input,provider:'openai',modelId:'other'}}),signal())).rejects.toThrow('not available')
  await expect(handleLocalMCP(request('call_tool',{name:'app_model',arguments:{...input,apiKey:'external'}}),signal())).rejects.toThrow('arguments')
})
it('blocks permissions at execution, narrows tool schemas, and confines MCP resources to this chat',async()=>{
  const tools=await localMCPTools(grant()),file=tools.find(tool=>tool.name==='session_file')!
  expect((file.inputSchema.properties as any).action.enum).toEqual(['list','read'])
  await expect(handleLocalMCP(request('call_tool',{name:'session_file',arguments:{action:'delete',path:'report.md'}}),signal())).rejects.toThrow('permissions');expect(state.execute).not.toHaveBeenCalled()
  const uri=sessionResourceURI('chat','file-one');expect(await handleLocalMCP(request('read_resource',{uri}),signal())).toMatchObject({contents:[{text:'# Private file'}]})
  state.read.mockClear();await expect(handleLocalMCP(request('read_resource',{uri:sessionResourceURI('other','file-one')}),signal())).rejects.toThrow('shared chat');expect(state.read).not.toHaveBeenCalled()
  state.locked=true;await expect(handleLocalMCP(request('list_resources'),signal())).rejects.toThrow('Locked')
})
it('supports an explicitly granted automatic model call and rejects configuration changes during approval',async()=>{
  const input={provider:'venice',modelId:'secure',messages:[{role:'user',content:'Hello'}],maxOutputTokens:20},automatic=grant();automatic.permissions.automaticModels=true
  await handleLocalMCP(request('call_tool',{grant:automatic,name:'app_model',arguments:input}),signal());expect(state.approve).not.toHaveBeenCalled()
  state.chat.mockClear();state.approve.mockImplementation(async()=>{state.settings={...state.settings,providers:{...state.settings.providers,venice:{...state.settings.providers.venice,apiKey:'CHANGED'}}};return true})
  await expect(handleLocalMCP(request('call_tool',{name:'app_model',arguments:input}),signal())).rejects.toThrow('configuration changed');expect(state.chat).not.toHaveBeenCalled()
})
