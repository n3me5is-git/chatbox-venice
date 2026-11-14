import {beforeEach,expect,it,vi} from 'vitest'
import {knowledgeEvidenceUrl} from '@shared/knowledge-evidence'
import {KnowledgeCheckReportSchema,knowledgeAnswerHash} from '@shared/knowledge-verification'
const state=vi.hoisted(()=>({header:{} as any,global:{} as any,store:{assert:vi.fn(),readEvidence:vi.fn(),data:vi.fn(),sourceRevision:vi.fn()},verify:vi.fn()}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessions:{getSessionHeader:async()=>state.header}}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.global})}}))
vi.mock('@/stores/uiStore',()=>({uiStore:{getState:()=>({sessionKnowledgeBaseMap:{chat:{id:-1}}})}}))
vi.mock('@/adapters/CurrentBlobStorage',()=>({currentBlobStorage:{get:async()=>null}}))
vi.mock('./service',()=>({knowledgeCollections:state.store}))
vi.mock('./verify',()=>({checkKnowledgeAnswer:(...args:any[])=>state.verify(...args)}))
import {createChatKnowledgePublication} from './publication'
const cfg={enabled:true,consented:true,model:{provider:'private',model:'judge'},correctConflicts:true},reference=knowledgeEvidenceUrl(-1,10,'a'.repeat(64))
beforeEach(()=>{vi.clearAllMocks();state.header={settings:{knowledgeVerification:cfg}};state.global={providers:{private:{apiKey:'fixture'}}};state.store.readEvidence.mockResolvedValue({id:'a'.repeat(64),name:'source',quote:'Actual source text',before:'Before',after:'After',stale:false,sourceHash:'b'.repeat(64)});state.store.data.mockResolvedValue({files:[{id:10,path:'source.txt'}]});state.store.sourceRevision.mockResolvedValue('b'.repeat(64));state.verify.mockImplementation(async(answer,_sources,_cfg,_signal,check)=>{await check();return {answer,report:KnowledgeCheckReportSchema.parse({version:1,id:crypto.randomUUID(),draftHash:await knowledgeAnswerHash(answer),answerHash:await knowledgeAnswerHash(answer),created:Date.now(),status:'unverified',reason:'no_sources',revised:false,calls:0,coverage:0,claims:[],sources:[],omittedEvidence:0})}})})
const message=()=>({id:'reply',role:'assistant' as const,contentParts:[{type:'text' as const,text:'Answer'},{type:'tool-call' as const,state:'result' as const,toolName:'knowledge_base',toolCallId:'call',result:{results:[{reference:{url:reference}}]}}]})
it('uses selected actual receipts and blocks source changes before a late model result can publish',async()=>{
 const gate=await createChatKnowledgePublication('chat',{knowledgeVerification:cfg},new AbortController().signal);await gate!.finish(message());expect(state.verify.mock.calls[0][1][0]).toMatchObject({id:'a'.repeat(64),origin:'knowledge',url:reference});state.verify.mockImplementationOnce(async(_answer,_sources,_cfg,_signal,check)=>{state.store.sourceRevision.mockResolvedValue('c'.repeat(64));await check()});await expect(gate!.finish(message())).rejects.toThrow('changed during verification')
})
it('respects the external endpoint collection boundary and requires its approval before verifier calls',async()=>{
 const check=vi.fn(),approve=vi.fn(async()=>{throw Error('Approval declined')}),signal=new AbortController().signal,settings={knowledgeVerification:cfg};let gate=await createChatKnowledgePublication('chat',settings,signal,{check,collectionIds:[],approve});await expect(gate!.finish(message())).rejects.toThrow('no longer attached');expect(state.verify).not.toHaveBeenCalled();gate=await createChatKnowledgePublication('chat',settings,signal,{check,collectionIds:[-1],approve});await expect(gate!.finish(message())).rejects.toThrow('declined');expect(approve).toHaveBeenCalledOnce();expect(state.verify).not.toHaveBeenCalled()
})
