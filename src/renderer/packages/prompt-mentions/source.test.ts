import {beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({collections:vi.fn(),assert:vi.fn(),scope:vi.fn()}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessions:{listSessionsMetaPage:async()=>({items:[],nextCursor:null})}}}))
vi.mock('@/packages/multi-agent/library',()=>({listDedicatedAgents:async()=>[{id:'worker',name:'worker',title:'Research worker'}]}))
vi.mock('@/packages/session-resources/service',()=>({listSessionResources:async()=>({items:[]})}))
vi.mock('@/packages/mcp/controller',()=>({mcpController:{getAvailableTools:()=>({lookup:{description:'Existing lookup tool'}})}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({projects:{sessionScope:f.scope,assertSession:f.assert}})}))
vi.mock('@/platform',()=>({default:{getKnowledgeBaseController:()=>({list:f.collections})}}))
import {loadPromptMentions} from './source'
beforeEach(()=>{vi.clearAllMocks();f.scope.mockResolvedValue(undefined);f.collections.mockResolvedValue([{id:-1,name:'Project manuals'},{id:1,name:'Legacy docs'}])})
it('adds portable collection mentions without reading source files or authorizing a collection',async()=>{const items=await loadPromptMentions('new',true,'',new AbortController().signal);expect(items.find(item=>item.kind==='knowledge')).toMatchObject({id:'-1',insert:'[@Project manuals](chatbox:knowledge/-1)'});expect(items.filter(item=>item.kind==='knowledge')).toHaveLength(1);expect(f.assert).not.toHaveBeenCalled()})
it('keeps existing agents and MCP tool mentions when the KB backend is unavailable',async()=>{f.collections.mockRejectedValue(Error('Device storage unavailable'));const items=await loadPromptMentions('new',true,'',new AbortController().signal);expect(items.map(item=>item.kind)).toEqual(['agent','tool'])})
it('does not suppress cancellation after a failed collection lookup',async()=>{const controller=new AbortController();f.collections.mockImplementation(async()=>{controller.abort();throw Error('Closed')});await expect(loadPromptMentions('new',true,'',controller.signal)).rejects.toBeDefined()})
