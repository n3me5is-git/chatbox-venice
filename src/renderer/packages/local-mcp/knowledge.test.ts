import {beforeEach,expect,it,vi} from 'vitest'
import {defaultLocalMCPPermissions,LocalMCPApplicationSchema,type LocalMCPGrant} from '@shared/local-mcp'
const state=vi.hoisted(()=>({authorize:vi.fn(),assert:vi.fn(),list:vi.fn(),documentText:vi.fn(),readEvidence:vi.fn(),federate:vi.fn()}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:state}))
vi.mock('@/packages/model-calls/toolsets/knowledge-federation',()=>({getFederatedKnowledgeToolSet:state.federate}))
import {applicationKnowledgeTools} from './knowledge'
const grant=():LocalMCPGrant=>({running:true,sessionId:'application',endpointId:crypto.randomUUID(),token:'fixture',url:'http://127.0.0.1:1234',startedAt:1,permissions:{...defaultLocalMCPPermissions,knowledge:true},application:LocalMCPApplicationSchema.parse({mode:'full',name:'KB',knowledgeCollectionIds:[-1,-2]})})
beforeEach(()=>{vi.clearAllMocks();state.federate.mockResolvedValue({tools:{}});state.list.mockResolvedValue([{id:-1,name:'Manuals',locked:false},{id:-2,name:'Protected collection',locked:true},{id:-3,name:'Unshared private KB',locked:false}]);state.documentText.mockResolvedValue({text:'Exact source text.',name:'manual.txt',mime:'text/plain',sourceHash:'a'.repeat(64),textHash:'b'.repeat(64)})})
it('requires explicit permission and grants, redacts discovery and does not prompt for owner access during tool listing',async()=>{
 const owner=grant(),live=vi.fn();owner.permissions.knowledge=false;expect(await applicationKnowledgeTools(owner,new AbortController().signal,live)).toEqual({});owner.permissions.knowledge=true;owner.application!.mode='router';expect(await applicationKnowledgeTools(owner,new AbortController().signal,live)).toEqual({});owner.application!.mode='full';const tools=await applicationKnowledgeTools(owner,new AbortController().signal,live);expect(state.authorize).not.toHaveBeenCalled();const result=await tools.knowledge_collections.execute!({} as never,{} as never);expect(JSON.stringify(result)).not.toContain('Unshared');expect(JSON.stringify(result)).toContain('Protected collection')
})
it('rejects ungranted collections before authentication, reads only bounded local text and rechecks revocation/collection locks after awaits',async()=>{
 const live=vi.fn(),tools=await applicationKnowledgeTools(grant(),new AbortController().signal,live),document=tools.knowledge_document
 await expect(document.execute!({collectionId:-3,fileId:10,offset:0,length:5} as never,{} as never)).rejects.toThrow('permissions');expect(state.authorize).not.toHaveBeenCalled()
 const result=await document.execute!({collectionId:-1,fileId:10,offset:0,length:5} as never,{} as never) as any;expect(result.text).toBe('Exact');expect(result.nextOffset).toBe(5);expect(state.assert).toHaveBeenCalledWith(-1)
 state.documentText.mockImplementationOnce(async()=>{live.mockRejectedValue(Error('Endpoint revoked'));return {text:'MUST NOT RETURN'}});await expect(document.execute!({collectionId:-1,fileId:10,offset:0,length:5} as never,{} as never)).rejects.toThrow('revoked')
 live.mockReset();state.assert.mockRejectedValueOnce(Error('Collection locked'));await expect(document.execute!({collectionId:-1,fileId:10,offset:0,length:5} as never,{} as never)).rejects.toThrow('locked')
})
