import {beforeEach,expect,it,vi} from 'vitest'
import {defaultLocalMCPPermissions,LocalMCPApplicationSchema,type LocalMCPGrant} from '@shared/local-mcp'
const state=vi.hoisted(()=>({authorize:vi.fn(),assert:vi.fn(),data:vi.fn(),readEvidence:vi.fn(),sourceRevision:vi.fn(),verify:vi.fn(),approve:vi.fn(),global:{} as any}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:state}))
vi.mock('@/packages/knowledge-collections/verify',()=>({checkKnowledgeAnswer:(...args:any[])=>state.verify(...args)}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.global})}}))
vi.mock('./model-approval',()=>({requestExternalModelApproval:(...args:any[])=>state.approve(...args)}))
import {applicationKnowledgeVerifier} from './knowledge-verification'
const grant=():LocalMCPGrant=>({running:true,sessionId:'application',token:'fixture',url:'http://localhost',startedAt:1,permissions:{...defaultLocalMCPPermissions,knowledge:true,models:true},application:LocalMCPApplicationSchema.parse({mode:'shadow',name:'KB',knowledgeCollectionIds:[-1],providers:['venice']})})
const input={answer:'Retention is 30 days.',sources:[{collectionId:-1,fileId:10,id:'a'.repeat(64)}],correctConflicts:false}
beforeEach(()=>{vi.clearAllMocks();state.global={defaultKnowledgeVerifierModel:{provider:'venice',model:'judge'},providers:{venice:{apiKey:'fixture-only'}}};state.approve.mockResolvedValue(true);state.data.mockResolvedValue({files:[{id:10,path:'documents/source.txt'}]});state.readEvidence.mockResolvedValue({id:'a'.repeat(64),name:'source.txt',sourceHash:'b'.repeat(64),quote:'Retention is 30 days.',before:'',after:'',stale:false});state.sourceRevision.mockResolvedValue('b'.repeat(64));state.verify.mockImplementation(async(_answer,_sources,_settings,_signal,check)=>{await check();return {answer:input.answer,report:{status:'checked'}}})})
it('checks actual granted source receipts and asks owner approval before any verifier request',async()=>{
 const tool=applicationKnowledgeVerifier(grant(),new AbortController().signal,async()=>{});await tool.execute!(input as never,{} as never);expect(state.authorize).toHaveBeenCalledWith(-1);expect(state.approve).toHaveBeenCalledOnce();expect(state.verify).toHaveBeenCalledOnce();state.approve.mockResolvedValue(false);await expect(tool.execute!(input as never,{} as never)).rejects.toThrow('approved');expect(state.verify).toHaveBeenCalledTimes(1)
})
it('rejects cross-collection access, privacy mismatches and source changes during model awaits',async()=>{
 const owner=grant(),tool=applicationKnowledgeVerifier(owner,new AbortController().signal,async()=>{});await expect(tool.execute!({...input,sources:[{...input.sources[0],collectionId:-2}]} as never,{} as never)).rejects.toThrow('permissions');expect(state.authorize).not.toHaveBeenCalled()
 owner.application!.privacy='e2ee';await expect(tool.execute!(input as never,{} as never)).rejects.toThrow('privacy');expect(state.verify).not.toHaveBeenCalled();owner.application!.privacy='auto'
 state.verify.mockImplementationOnce(async(_answer,_sources,_settings,_signal,check)=>{state.sourceRevision.mockResolvedValue('c'.repeat(64));await check();return {answer:'MUST NOT RETURN'}});await expect(tool.execute!(input as never,{} as never)).rejects.toThrow('changed during verification')
})
