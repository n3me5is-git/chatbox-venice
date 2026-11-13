import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({toolCapabilities:vi.fn(),authorize:vi.fn(),data:vi.fn(),metadata:vi.fn(),citeAnchors:vi.fn()}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:state}))
import {getAdvancedKnowledgeTools} from './knowledge-intelligence'
beforeEach(()=>{vi.clearAllMocks();state.toolCapabilities.mockResolvedValue({advanced:true,locked:false});state.data.mockResolvedValue({augmentation:{enabled:true}});state.metadata.mockResolvedValue({results:[],scope:'non-exhaustive'});state.citeAnchors.mockResolvedValue([{id:'receipt',url:'local-reference'}])})
it('preserves native tools and hides advanced tools for unconfigured or locked collections without prompting',async()=>{
 expect(await getAdvancedKnowledgeTools(1)).toEqual({});state.toolCapabilities.mockResolvedValue({advanced:false,locked:true});expect(await getAdvancedKnowledgeTools(-1)).toEqual({});expect(state.authorize).not.toHaveBeenCalled();expect(state.data).not.toHaveBeenCalled()
})
it('authenticates each metadata/source call, scopes it to the selected collection and rechecks opt-in',async()=>{
 const tools=await getAdvancedKnowledgeTools(-1),signal=new AbortController().signal
 expect(state.authorize).not.toHaveBeenCalled();await tools.knowledge_metadata.execute!({type:'client',offset:12} as never,{abortSignal:signal} as never);expect(state.metadata).toHaveBeenCalledWith(-1,{type:'client',offset:12},signal)
 const anchors=[{fileId:10,sourceHash:'a'.repeat(64),textHash:'b'.repeat(64),start:2,end:8}];await tools.knowledge_sources.execute!({anchors} as never,{abortSignal:signal} as never);expect(state.citeAnchors).toHaveBeenCalledWith(-1,anchors,signal)
 state.authorize.mockRejectedValueOnce(Error('Access declined'));await expect(tools.knowledge_sources.execute!({anchors} as never,{} as never)).rejects.toThrow('declined');expect(state.citeAnchors).toHaveBeenCalledTimes(1)
 state.data.mockResolvedValue({augmentation:{enabled:false}});await expect(tools.knowledge_metadata.execute!({} as never,{} as never)).rejects.toThrow('disabled');expect(state.metadata).toHaveBeenCalledTimes(1)
})
