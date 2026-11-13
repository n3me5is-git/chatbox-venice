import {z} from 'zod'
import {ragHash} from './session-rag-engine'
export const KnowledgeEvidenceSchema=z.object({version:z.literal(1),id:z.string().regex(/^[a-f0-9]{64}$/),collectionId:z.number().int().negative(),fileId:z.number().int().positive(),name:z.string().max(512),mime:z.string().max(120).optional(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),quote:z.string().min(1).max(8000),before:z.string().max(2000),after:z.string().max(2000),line:z.number().int().min(1).optional(),endLine:z.number().int().min(1).optional(),page:z.number().int().positive().optional(),start:z.number().int().min(0).max(512000).optional(),end:z.number().int().min(0).max(512000).optional(),textHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),created:z.number().finite()}).strict()
export type KnowledgeEvidence=z.infer<typeof KnowledgeEvidenceSchema>
export const knowledgeEvidenceId=(value:Pick<KnowledgeEvidence,'collectionId'|'fileId'|'sourceHash'|'quote'|'line'|'page'|'start'|'textHash'>)=>ragHash(new TextEncoder().encode(JSON.stringify([value.collectionId,value.fileId,value.sourceHash,value.quote,value.line,value.page,value.start,value.textHash])))
export const knowledgeEvidenceUrl=(collectionId:number,fileId:number,id:string)=>'https://chatbox.invalid/knowledge/'+collectionId+'/'+fileId+'/'+id
export function parseKnowledgeEvidenceUrl(value:string|undefined){
 if(!value)return null
 try{const url=new URL(value);if(url.origin!=='https://chatbox.invalid'||url.search||url.hash||url.username||url.password)return null;const match=/^\/knowledge\/(-\d+)\/(\d+)\/([a-f0-9]{64})$/.exec(url.pathname);if(!match)return null;const collectionId=Number(match[1]),fileId=Number(match[2]);return Number.isSafeInteger(collectionId)&&collectionId<0&&Number.isSafeInteger(fileId)&&fileId>0&&knowledgeEvidenceUrl(collectionId,fileId,match[3])===value?{collectionId,fileId,id:match[3]}:null}catch{return null}
}
