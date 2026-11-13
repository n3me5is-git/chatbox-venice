import {z} from 'zod'
import {KnowledgeModelSchema} from './knowledge-json'
export const KNOWLEDGE_ANALYSIS_VERSION=2
export const KnowledgeAugmentationSchema=z.object({enabled:z.boolean().default(false),model:KnowledgeModelSchema.optional(),keepMarkdown:z.boolean().default(false),mediaText:z.boolean().default(false),windowChars:z.number().int().min(2000).max(12000).default(8000)}).strict()
export type KnowledgeAugmentation=z.infer<typeof KnowledgeAugmentationSchema>
const label=z.string().trim().min(1).max(160),quote=z.string().min(3).max(800)
export const KnowledgeExtractionSchema=z.object({summary:z.string().max(600),entities:z.array(z.object({name:label,type:label,quote}).strict()).max(32),relations:z.array(z.object({subject:label,predicate:label,object:label,quote}).strict()).max(48),tags:z.array(z.object({key:label,value:label,quote}).strict()).max(32)}).strict()
export type KnowledgeExtraction=z.infer<typeof KnowledgeExtractionSchema>
export type KnowledgeAnchor={start:number;end:number;quote:string}
export type KnowledgeEntity={id:string;name:string;type:string;anchor:KnowledgeAnchor}
export type KnowledgeRelation={subject:string;predicate:string;object:string;anchor:KnowledgeAnchor}
export type KnowledgeTag={key:string;value:string;anchor:KnowledgeAnchor}
export type KnowledgeAnalysis={version:1;fileId:string;sourceHash:string;textHash:string;fingerprint:string;summary:string;sections:{start:number;end:number;summary:string;hash?:string}[];entities:KnowledgeEntity[];relations:KnowledgeRelation[];tags:KnowledgeTag[];warnings?:{code:'relation-reference'|'relation-quote';index:number;windowStart:number}[];text?:string}
export function knowledgeTerms(value:string){return [...new Set(value.normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}]{2,64}/gu)||[])].slice(0,128)}
export function knowledgeWindows(text:string,max=8000){
 if(text.length>512000)throw Error('Knowledge text exceeds the analysis limit')
 if(!Number.isInteger(max)||max<2000||max>12000)throw Error('Invalid knowledge window size')
 const windows:{start:number;end:number;text:string}[]=[]
 for(let start=0;start<text.length;){if(windows.length>=64)throw Error('Knowledge analysis window limit reached');let end=Math.min(text.length,start+max);if(end<text.length){const line=text.lastIndexOf('\n',end);if(line>start+max/2)end=line+1;else if(/[\uD800-\uDBFF]/.test(text[end-1]))end--}windows.push({start,end,text:text.slice(start,end)});start=end}
 return windows
}
export function anchorKnowledgeQuote(text:string,quote:string,offset=0):KnowledgeAnchor{
 const at=text.indexOf(quote);if(at<0)throw Error('Extracted knowledge quote is absent from the source')
 return {start:offset+at,end:offset+at+quote.length,quote}
}
/** RRF combines retrieval ranks without comparing incompatible embedding score spaces. */
export function fuseKnowledgeRanks<T extends {id:string}>(lanes:T[][],limit=20){
 const scores=new Map<string,{item:T;score:number;first:number}>();let first=0
 for(const lane of lanes){const seen=new Set<string>();lane.forEach((item,rank)=>{if(seen.has(item.id))return;seen.add(item.id);const old=scores.get(item.id)||{item,score:0,first:first++};old.score+=1/(60+rank+1);scores.set(item.id,old)})}
 return [...scores.values()].sort((a,b)=>b.score-a.score||a.first-b.first).slice(0,Math.min(100,Math.max(1,limit))).map(entry=>({...entry.item,rankScore:entry.score}))
}

const digest=z.string().regex(/^[a-f0-9]{64}$/),offset=z.number().int().min(0).max(512000)
const anchor=z.object({start:offset,end:offset,quote}).strict().refine(value=>value.end>value.start&&value.end-value.start===value.quote.length)
export const KnowledgeAnalysisSchema=z.object({version:z.literal(1),fileId:z.string().min(1).max(128),sourceHash:digest,textHash:digest,fingerprint:digest,summary:z.string().max(2400),sections:z.array(z.object({start:offset,end:offset,summary:z.string().max(600),hash:digest.optional()}).strict()).max(64),entities:z.array(z.object({id:digest,name:label,type:label,anchor}).strict()).max(2048),relations:z.array(z.object({subject:digest,predicate:label,object:digest,anchor}).strict()).max(3072),tags:z.array(z.object({key:label,value:label,anchor}).strict()).max(2048),warnings:z.array(z.object({code:z.enum(['relation-reference','relation-quote']),index:z.number().int().min(0).max(48),windowStart:offset}).strict()).max(3072).optional(),text:z.string().max(512000).optional()}).strict()
export const KnowledgeAnalysisManifestSchema=z.object({version:z.literal(1),updated:z.number().finite(),stats:z.object({extractedWindows:z.number().int().min(0),reusedWindows:z.number().int().min(0),unchangedDocuments:z.number().int().min(0),reboundDocuments:z.number().int().min(0)}).optional(),files:z.array(z.object({fileId:z.string().min(1).max(128),sourceHash:digest,textHash:digest,fingerprint:digest,alias:z.string().regex(/^\.chatbox\/knowledge\/data\/[a-f0-9-]{36}\.json$/),terms:z.array(z.string().max(64)).max(128),warningCount:z.number().int().min(0).max(3072).optional()}).strict()).max(10000)}).strict().refine(value=>new Set(value.files.map(file=>file.fileId)).size===value.files.length)
