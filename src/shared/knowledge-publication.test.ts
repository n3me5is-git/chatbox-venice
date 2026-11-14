import {expect,it} from 'vitest'
import {createKnowledgePublication,knowledgeAnswerText} from './knowledge-publication'
import {KnowledgeCheckReportSchema,knowledgeAnswerHash} from './knowledge-verification'
import {SECURITY_INFO} from './response-security'
import type {Message} from './types'
async function review(draft:string,answer=draft){return {answer,report:KnowledgeCheckReportSchema.parse({version:1,id:crypto.randomUUID(),draftHash:await knowledgeAnswerHash(draft),answerHash:await knowledgeAnswerHash(answer),created:Date.now(),status:'unverified',reason:'no_sources',revised:answer!==draft,calls:0,coverage:0,claims:[],sources:[],omittedEvidence:0})}}
it('hides draft text, reasoning and transport badges at every checkpoint while preserving tool and media parts',async()=>{
 const message:Message={id:'reply',role:'assistant',contentParts:[{type:'text',text:'Draft'},{type:'reasoning',text:'Private thought'},{type:'info',text:SECURITY_INFO,values:{}},{type:'tool-call',toolCallId:'call',toolName:'ask_user',state:'paused'},{type:'image',storageKey:'encrypted'}]},gate=createKnowledgePublication(async parts=>review(knowledgeAnswerText(parts)))
 expect(gate.project(message).contentParts.map(part=>part.type)).toEqual(['tool-call','image']);const final=await gate.finish(message);expect(knowledgeAnswerText(gate.project(final).contentParts)).toBe('Draft');expect(gate.project({...final,contentParts:[...final.contentParts,{type:'text',text:'Unreviewed append'}]}).contentParts.some(part=>part.type==='text')).toBe(false)
})
it('publishes corrected text without inheriting the draft transport badge, retaining signed blocks only for replay',async()=>{
 const message:Message={id:'reply',role:'assistant',contentParts:[{type:'text',text:'90 days',providerMetadata:{google:{thoughtSignature:'opaque'}}},{type:'info',text:SECURITY_INFO,values:{}}]},gate=createKnowledgePublication(async()=>review('90 days','30 days')),final=await gate.finish(message)
 expect(knowledgeAnswerText(final.contentParts)).toBe('30 days');expect(final.contentParts.some(part=>part.type==='info'&&part.text===SECURITY_INFO)).toBe(false);expect(final.contentParts[0]).toMatchObject({type:'text',text:'90 days',protocolOnly:true,providerMetadata:{google:{thoughtSignature:'opaque'}}})
})
it('rejects a report bound to a different final answer',async()=>{
 const value=await review('Draft');value.answer='Other answer';const gate=createKnowledgePublication(async()=>value);await expect(gate.finish({id:'reply',role:'assistant',contentParts:[{type:'text',text:'Draft'}]})).rejects.toThrow('does not match')
})
