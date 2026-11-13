import {z} from 'zod'
export const KnowledgeModelSchema=z.object({provider:z.string().min(1).max(128),model:z.string().min(1).max(256)}).strict()
export type KnowledgeModel=z.infer<typeof KnowledgeModelSchema>
/** Only JSON, optionally surrounded by one Markdown JSON fence. No prose recovery. */
export function parseKnowledgeJson(value:string):unknown{
 if(value.length>64000)throw Error('Knowledge model response exceeds the size limit')
 const text=value.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/i,'$1')
 try{return JSON.parse(text)}catch{throw Error('The knowledge model returned invalid JSON')}
}
export const RankingSchema=z.object({ranking:z.array(z.object({index:z.number().int().min(0).max(19),score:z.number().min(0).max(1)}).strict()).min(1).max(20)}).strict()
export function validateKnowledgeRanking(value:unknown,count:number){
 const {ranking}=RankingSchema.parse(value),seen=new Set<number>()
 for(const item of ranking){if(item.index>=count||seen.has(item.index))throw Error('Invalid LLM rerank passage identity');seen.add(item.index)}
 return [...ranking].sort((a,b)=>b.score-a.score||a.index-b.index)
}
