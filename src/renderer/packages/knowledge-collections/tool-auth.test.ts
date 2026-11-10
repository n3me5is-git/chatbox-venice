import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({authorize:vi.fn(),data:vi.fn(),list:vi.fn(),search:vi.fn(),chunks:vi.fn(),indexStatus:vi.fn(),controller:null as any}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:state}))
vi.mock('@/platform',()=>({default:{getKnowledgeBaseController:()=>state.controller}}))
import {portableKnowledgeController} from '@/platform/knowledge-base/portable-controller'
import {getToolSet} from '@/packages/model-calls/toolsets/knowledge-base'
beforeEach(()=>{vi.clearAllMocks();state.controller=portableKnowledgeController();state.list.mockResolvedValue([{id:-1,name:'Protected collection',scope:'knowledge:-1',locked:true,createdAt:1}]);state.data.mockResolvedValue({files:[{id:10,path:'documents/doc.txt',name:'Private manual',mime:'text/plain',bytes:10,createdAt:1}]});state.indexStatus.mockResolvedValue({files:[{path:'documents/doc.txt',chunks:1}],errors:[]});state.search.mockResolvedValue({matches:[{id:'chunk',score:0.9}]});state.chunks.mockResolvedValue([{fileId:10,filename:'Private manual',chunkIndex:0,text:'Protected passage',chunk:{id:'chunk'}}])})
it('does not enumerate private metadata or prompt for a PIN while building model tool definitions',async()=>{
 const set=await getToolSet(-1,'Private manual');expect(state.authorize).not.toHaveBeenCalled();expect(state.data).not.toHaveBeenCalled();expect(state.list).not.toHaveBeenCalled();expect(set.tools.knowledge_base.description).not.toContain('Private manual')
})
it('requires owner HITL for search/list/read commands before exposing protected content',async()=>{
 const set=await getToolSet(-1,'Protected collection'),tool=set.tools.knowledge_base
 for(const input of [{command:'search',query:'find'},{command:'list'},{command:'read',fileId:10}]){
   state.authorize.mockRejectedValueOnce(Error('Access declined'));await expect(tool.execute!(input as never,{} as never)).rejects.toThrow('declined')
 }
 expect(state.search).not.toHaveBeenCalled();expect(state.data).not.toHaveBeenCalled();expect(state.chunks).not.toHaveBeenCalled()
 state.authorize.mockResolvedValue(undefined);const result=await tool.execute!({command:'search',query:'find'} as never,{} as never);expect(JSON.stringify(result)).toContain('Protected passage')
})
