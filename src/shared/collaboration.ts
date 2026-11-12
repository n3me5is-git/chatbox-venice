import { z } from 'zod'
import { UserQuestionsSchema } from './user-questions'
import type { Message } from './types'

export const SharePermissionsSchema = z.object({write:z.boolean(),interact:z.boolean(),clone:z.boolean()}).strict()
export type SharePermissions = z.infer<typeof SharePermissionsSchema>
export const HitlPolicySchema = z.enum(['owner','first','requester'])
export type HitlPolicy = z.infer<typeof HitlPolicySchema>
export const defaultSharePermissions:SharePermissions = {write:false,interact:false,clone:false}
export const SharedAuthorSchema = z.object({id:z.string().max(100),name:z.string().trim().min(1).max(60)}).strict()
export type SharedAuthor = z.infer<typeof SharedAuthorSchema>
/** Sharing a chat must not silently unlock its individually protected creations. */
export function canShareAsset(sessionScope:string|undefined,assetScope:string|undefined){return assetScope===undefined||assetScope==='public'||assetScope===(sessionScope||'public')}
export function collaborationRequester(messages:Message[]):SharedAuthor{const message=[...messages].reverse().find(message=>message.role==='user');return message?.collaborationRequester||message?.collaborationAuthor||{id:'owner',name:'Owner'}}
export const SharedFileSchema=z.object({id:z.string().max(400),path:z.string().max(240),name:z.string().max(240),mime:z.string().max(100),bytes:z.number().int().min(0).max(128*1024*1024).optional(),deliverable:z.boolean().optional()}).strict()
export const SharedThinkingSchema=z.enum(['default','off','minimal','low','medium','high','xhigh','max'])
export const SharedSearchSchema=z.object({webSearch:z.enum(['off','auto','on']),webSearchEnabled:z.boolean(),searchProvider:z.enum(['native','brave','google','exa']),searchToolMode:z.enum(['selected','separate']),webCitations:z.boolean(),webScraping:z.boolean(),xSearch:z.boolean()}).strict()
/** Deliberately excludes model, credentials, endpoints, system prompts and MCP configuration. */
export const SharedControlPatchSchema=z.object({thinking:SharedThinkingSchema.optional(),webBrowsing:z.boolean().optional(),venice:SharedSearchSchema.partial().optional(),subscriptionWebSearch:z.boolean().optional()}).strict().refine(value=>Object.keys(value).length>0)
export type SharedControlPatch=z.infer<typeof SharedControlPatchSchema>
export const SharedControlsSchema=z.object({revision:z.string().max(100),model:z.string().max(240),thinking:SharedThinkingSchema,thinkingOptions:z.array(SharedThinkingSchema).max(8),webBrowsing:z.boolean(),venice:SharedSearchSchema.optional(),subscriptionWebSearch:z.boolean().optional()}).strict()
export type SharedControls=z.infer<typeof SharedControlsSchema>
export const SharedMentionsSchema=z.array(z.object({id:z.string().max(240),kind:z.enum(['agent','tool']),name:z.string().max(240),description:z.string().max(200).optional(),insert:z.string().max(260)}).strict()).max(300)
export const SharedMessageSchema=z.object({id:z.string().max(240),role:z.enum(['user','assistant','system']),text:z.string().max(200000),author:SharedAuthorSchema.optional(),files:z.array(z.string().max(400)).max(100).optional(),archived:z.boolean().optional(),generating:z.boolean().optional(),error:z.string().max(4000).optional(),reasoning:z.string().max(100000).optional(),tools:z.array(z.object({id:z.string().max(240),name:z.string().max(240),state:z.enum(['running','completed','failed']),detail:z.string().max(20000)}).strict()).max(100).optional()}).strict()
export const SnapshotSchema=z.object({title:z.string().max(240),messages:z.array(SharedMessageSchema).max(10000),files:z.array(SharedFileSchema).max(4000),truncated:z.boolean(),revision:z.number().int().min(0),controls:SharedControlsSchema.optional(),busy:z.boolean().optional(),mentions:SharedMentionsSchema.optional()}).strict()
export type SharedSnapshot=z.infer<typeof SnapshotSchema>
export type SharedFile=z.infer<typeof SharedFileSchema>
const QuickPriceSchema=z.object({amount:z.number().nonnegative(),maximum:z.number().nonnegative().optional(),output:z.number().nonnegative().optional(),currency:z.enum(['USD','DIEM']),unit:z.enum(['1M tokens','1M characters','1,000 characters','image','second','generation']),from:z.boolean().optional()}).strict()
export const HitlInputSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('questions'),input:UserQuestionsSchema}).strict(),
  z.object({kind:z.literal('confirm'),title:z.string().max(240),detail:z.string().max(20000)}).strict(),
  z.object({kind:z.literal('image'),extra_json:z.string().max(64000).optional(),aspectRatio:z.string().max(10).optional(),prompt:z.string().max(20000),modelId:z.string().max(200).optional(),count:z.number().int().min(1).max(4),models:z.array(z.object({id:z.string().max(200),name:z.string().max(240),requiresReferences:z.boolean().optional(),ratios:z.array(z.string().max(10)).max(30).optional(),price:QuickPriceSchema.optional()})).max(300)}).strict(),
])
export type HitlInput=z.infer<typeof HitlInputSchema>
export const HitlRequestSchema=z.object({id:z.string().uuid(),requester:z.string().max(100),input:HitlInputSchema,expires:z.number(),policy:HitlPolicySchema}).strict()
export type HitlRequest=z.infer<typeof HitlRequestSchema>
export const HitlAnswerSchema=z.union([z.null(),z.boolean(),z.object({answers:z.array(z.object({selected:z.array(z.string().max(240)).max(8),text:z.string().max(10000)}).strict()).max(3)}).strict(),z.object({modelId:z.string().max(200),extra_json:z.string().max(64000).optional(),prompt:z.string().trim().min(1).max(20000),count:z.number().int().min(1).max(4),aspectRatio:z.string().regex(/^(auto|\d{1,2}:\d{1,2})$/)}).strict()])
export type HitlAnswer=z.infer<typeof HitlAnswerSchema>
export function validHitlAnswer(input:HitlInput,answer:unknown):answer is HitlAnswer{
  if(!HitlAnswerSchema.safeParse(answer).success)return false
  if(answer===null)return true
  if(input.kind==='confirm')return typeof answer==='boolean'
  if(input.kind==='image')return !!answer&&typeof answer==='object'&&'modelId'in answer&&input.models.some(model=>model.id===answer.modelId)
  if(!answer||typeof answer!=='object'||!('answers'in answer))return false
  const answers=(answer as {answers:{selected:string[];text:string}[]}).answers
  return answers.length===input.input.questions.length&&answers.every((item,index)=>{
    const question=input.input.questions[index]
    return (item.selected.length>0||!!item.text.trim())&&(question.multiple||item.selected.length<=1)&&item.selected.every(value=>question.options?.includes(value))
  })
}
/** Only the host calls accept. A response is consumed atomically before resolving. */
export class SharedHitlQueue{
  private pending=new Map<string,{request:HitlRequest;resolve:(answer:HitlAnswer)=>void;cleanup:()=>void}>()
  constructor(private policy:()=>HitlPolicy,private members:()=>Set<string>,private publish:()=>void){}
  requests(actor:string){return [...this.pending.values()].map(item=>item.request).filter(request=>this.allowed(request,actor))}
  private allowed(request:HitlRequest,actor:string){const member=actor==='owner'||this.members().has(actor);return member&&(this.policy()==='owner'?actor==='owner':this.policy()==='first'||actor===request.requester)}
  ask(requester:string,input:HitlInput,signal?:AbortSignal):Promise<HitlAnswer>{
    signal?.throwIfAborted();HitlInputSchema.parse(input)
    if(this.pending.size>=20)throw Error('Too many pending questions')
    return new Promise(resolve=>{
      const request:HitlRequest={id:crypto.randomUUID(),requester,input,expires:Date.now()+10*60*1000,policy:this.policy()}
      const cancel=()=>this.finish(request.id,null),timer=setTimeout(cancel,10*60*1000)
      this.pending.set(request.id,{request,resolve,cleanup:()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}})
      signal?.addEventListener('abort',cancel,{once:true});this.publish()
    })
  }
  accept(id:string,actor:string,answer:unknown){
    const item=this.pending.get(id)
    if(!item||item.request.expires<Date.now()||!this.allowed(item.request,actor)||!validHitlAnswer(item.request.input,answer))return false
    if(actor!=='owner'&&item.request.input.kind==='image'&&answer&&typeof answer==='object'&&'modelId'in answer){const model=item.request.input.models.find(model=>model.id===answer.modelId);if(model?.requiresReferences||answer.aspectRatio!=='auto'&&model?.ratios&&!model.ratios.includes(answer.aspectRatio))return false}
    this.finish(id,answer);return true
  }
  private finish(id:string,answer:HitlAnswer){const item=this.pending.get(id);if(!item)return;this.pending.delete(id);item.cleanup();item.resolve(answer);this.publish()}
  revoke(actor:string){for(const [id,item]of this.pending)if(item.request.requester===actor)this.finish(id,null);this.publish()}
  cancel(){for(const id of [...this.pending.keys()])this.finish(id,null)}
}
