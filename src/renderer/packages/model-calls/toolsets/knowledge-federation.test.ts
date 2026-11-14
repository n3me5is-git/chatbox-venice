import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({run:vi.fn(),single:vi.fn(),advanced:vi.fn(),authorize:vi.fn(),assert:vi.fn(),list:vi.fn()}))
vi.mock('./knowledge-base',()=>({runKnowledgeBaseCommand:state.run,getToolSet:state.single,formatKnowledgeBaseOutput:(command:string,output:any)=>command+': '+JSON.stringify(output)}))
vi.mock('./knowledge-intelligence',()=>({getAdvancedKnowledgeTools:state.advanced}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:{authorize:state.authorize,assert:state.assert}}))
vi.mock('@/platform',()=>({default:{getKnowledgeBaseController:()=>({list:state.list})}}))
import {getFederatedKnowledgeToolSet} from './knowledge-federation'
beforeEach(()=>{vi.clearAllMocks();state.advanced.mockResolvedValue({});state.list.mockResolvedValue([{id:-1,name:'Manuals'},{id:-2,name:'Policies'}]);state.run.mockImplementation(async(id,input)=>input.command==='read'?{fileId:10,chunks:[{text:'Excerpt',chunkIndex:0}]}:{results:[{fileId:10,filename:'source',chunkIndex:0,text:id===-1?'Noise':'Aurora Acme',score:id===-1?1e6:-100}]})})
it('searches only attached collections with sequential authentication and bounded retrieval, preserving collection identities',async()=>{
 const set=await getFederatedKnowledgeToolSet([-1,-2]),tool=set.tools.knowledge_base,output=await tool.execute!({command:'search',query:'Aurora Acme'} as never,{} as never) as any
 expect(state.authorize.mock.calls).toEqual([[-1],[-2]]);expect(state.run).toHaveBeenCalledTimes(2);expect(output.results[0].collectionId).toBe(-2);expect(state.assert.mock.calls).toEqual([[-1],[-2]])
 await expect(tool.execute!({command:'read',collectionId:-3,fileId:10} as never,{} as never)).rejects.toThrow('attached');expect(state.run).toHaveBeenCalledTimes(2)
 const read=await tool.execute!({command:'read',collectionId:-1,fileId:10} as never,{} as never);expect(JSON.stringify(tool.toModelOutput!({toolCallId:'x',input:{command:'read'},output:read} as never))).toContain('read:')
})
it('does not query any provider if owner access is declined, and rejects oversized collection sets',async()=>{
 const tool=(await getFederatedKnowledgeToolSet([-1,-2])).tools.knowledge_base;state.authorize.mockRejectedValueOnce(Error('Access declined'));await expect(tool.execute!({command:'search',query:'find'} as never,{} as never)).rejects.toThrow('declined');expect(state.run).not.toHaveBeenCalled();await expect(getFederatedKnowledgeToolSet(Array.from({length:9},(_,n)=>-n-1))).rejects.toThrow('eight')
})
