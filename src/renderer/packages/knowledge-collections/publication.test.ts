import {beforeEach,expect,it,vi} from 'vitest'
import {knowledgeEvidenceUrl} from '@shared/knowledge-evidence'
import {KnowledgeCheckReportSchema,knowledgeAnswerHash} from '@shared/knowledge-verification'
const state=vi.hoisted(()=>({header:{} as any,global:{} as any,store:{assert:vi.fn(),readEvidence:vi.fn(),data:vi.fn(),sourceRevision:vi.fn(),searchReviewPassages:vi.fn(),chunksForMatches:vi.fn(),citeChunks:vi.fn()},verify:vi.fn()}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessions:{getSessionHeader:async()=>state.header?{header:state.header}:null}}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.global})}}))
vi.mock('@/stores/uiStore',()=>({uiStore:{getState:()=>({sessionKnowledgeBaseMap:{chat:{id:-1}}})}}))
vi.mock('@/adapters/CurrentBlobStorage',()=>({currentBlobStorage:{get:async()=>null}}))
vi.mock('./service',()=>({knowledgeCollections:state.store}))
vi.mock('./verify',()=>({checkKnowledgeAnswer:(...args:any[])=>state.verify(...args)}))
import {createChatKnowledgePublication} from './publication'
const cfg={enabled:true,consented:true,model:{provider:'private',model:'judge'},correctConflicts:true},reference=knowledgeEvidenceUrl(-1,10,'a'.repeat(64))
beforeEach(()=>{vi.clearAllMocks();state.header={settings:{knowledgeVerification:cfg}};state.global={providers:{private:{apiKey:'fixture'}}};state.store.readEvidence.mockResolvedValue({id:'a'.repeat(64),name:'source',quote:'Actual source text',before:'Before',after:'After',stale:false,sourceHash:'b'.repeat(64)});state.store.data.mockResolvedValue({files:[{id:10,path:'source.txt'}]});state.store.sourceRevision.mockResolvedValue('b'.repeat(64));state.verify.mockImplementation(async(answer,_sources,_cfg,_signal,check)=>{await check();return {answer,report:KnowledgeCheckReportSchema.parse({version:1,id:crypto.randomUUID(),draftHash:await knowledgeAnswerHash(answer),answerHash:await knowledgeAnswerHash(answer),created:Date.now(),status:'unverified',reason:'no_sources',revised:false,calls:0,coverage:0,claims:[],sources:[],omittedEvidence:0})}})})
const message=()=>({id:'reply',role:'assistant' as const,contentParts:[{type:'text' as const,text:'I will search the collection.'},{type:'tool-call' as const,state:'result' as const,toolName:'knowledge_base',toolCallId:'call',result:{results:[{reference:{url:reference}}]}},{type:'text' as const,text:'Answer'}]})
it('sends only the final answer to the checker, retaining narration as work history',async()=>{const gate=await createChatKnowledgePublication('chat',{knowledgeVerification:cfg},new AbortController().signal),result=await gate!.finish(message());expect(state.verify.mock.calls[0][0]).toBe('Answer');expect(result.contentParts[0]).toMatchObject({text:'I will search the collection.'});expect(result.contentParts.at(-1)).toMatchObject({values:{report:{answerScope:'final-answer-v1'}}})})
it('uses selected actual receipts and blocks source changes before a late model result can publish',async()=>{
 const gate=await createChatKnowledgePublication('chat',{knowledgeVerification:cfg},new AbortController().signal);await gate!.finish(message());expect(state.verify.mock.calls[0][1][0]).toMatchObject({id:'a'.repeat(64),origin:'knowledge',url:reference});state.verify.mockImplementationOnce(async(_answer,_sources,_cfg,_signal,check)=>{state.store.sourceRevision.mockResolvedValue('c'.repeat(64));await check()});await expect(gate!.finish(message())).rejects.toThrow('changed during verification')
})
it('respects the external endpoint collection boundary and requires its approval before verifier calls',async()=>{
 const check=vi.fn(),approve=vi.fn(async()=>{throw Error('Approval declined')}),signal=new AbortController().signal,settings={knowledgeVerification:cfg};let gate=await createChatKnowledgePublication('chat',settings,signal,{check,collectionIds:[],approve});await expect(gate!.finish(message())).rejects.toThrow('no longer attached');expect(state.verify).not.toHaveBeenCalled();gate=await createChatKnowledgePublication('chat',settings,signal,{check,collectionIds:[-1],approve});await expect(gate!.finish(message())).rejects.toThrow('declined');expect(approve).toHaveBeenCalledOnce();expect(state.verify).not.toHaveBeenCalled()
})

it('retrieves real additional passages only from receipt collections and requests approval before use',async()=>{
 const settings={knowledgeVerification:{...cfg,followUpSearches:2 as const},knowledgeCollectionIds:[-2]}
 state.header={settings}
 const newId='f'.repeat(64)
 const signal=new AbortController().signal
 const approveFollowUp=vi.fn(async()=>{})
 state.store.searchReviewPassages.mockResolvedValue([{id:'hit'}])
 state.store.chunksForMatches.mockResolvedValue([{chunk:{id:'hit'},fileId:10,chunkIndex:1,text:'Updated context'}])
 state.store.citeChunks.mockResolvedValue([{id:newId}])
 state.store.readEvidence.mockImplementation(async(_id,_file,receiptId)=>({
  id:receiptId,sourceHash:'b'.repeat(64),name:'source',quote:receiptId===newId?'Updated context':'Actual source text',
  before:'',after:'',stale:false,
 }))
 state.verify.mockImplementationOnce(async(answer,sources,_cfg,_signal,check,_security,_observe,retrieve)=>{
  const fresh=await retrieve('current policy',sources,signal)
  expect(fresh).toEqual([{id:newId,origin:'knowledge',url:knowledgeEvidenceUrl(-1,10,newId),name:'source',content:'Updated context'}])
  await check()
  return {answer,report:KnowledgeCheckReportSchema.parse({
   version:1,id:crypto.randomUUID(),draftHash:await knowledgeAnswerHash(answer),answerHash:await knowledgeAnswerHash(answer),
   created:0,status:'incomplete',reason:'partial_coverage',revised:false,calls:2,coverage:0,claims:[],sources:[],omittedEvidence:0,
  })}
 })
 const gate=await createChatKnowledgePublication('chat',settings,signal,{check:async()=>{},collectionIds:[-1,-2],approveFollowUp})
 await gate!.finish(message())
 expect(state.store.searchReviewPassages).toHaveBeenCalledOnce()
 expect(state.store.searchReviewPassages).toHaveBeenCalledWith(-1,'current policy',signal)
 expect(approveFollowUp).toHaveBeenCalledOnce()
 expect(approveFollowUp).toHaveBeenCalledWith('current policy',[expect.objectContaining({id:newId})])
})
