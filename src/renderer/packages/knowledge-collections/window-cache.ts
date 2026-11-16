import {z} from 'zod'
import {KnowledgeExtractionSchema,type KnowledgeExtraction} from '@shared/knowledge-augmentation'
import type {AugmentedPort} from './augmented'
const MANIFEST='.chatbox/knowledge/window-cache.json',digest=z.string().regex(/^[a-f0-9]{64}$/),alias=z.string().regex(/^\.chatbox\/knowledge\/data\/[a-f0-9-]{36}\.json$/)
export const WindowCacheEntries=z.array(z.object({key:digest,alias,fileId:z.string().max(128)}).strict()).max(64)
const Entries=WindowCacheEntries,Record=z.object({key:digest,value:KnowledgeExtractionSchema}).strict()
/** Bounded, collection-encrypted LRU. Only schema-checked model windows enter this cache.
 * Hashes bind model/configuration and exact source text; cached output is re-anchored by the engine. */
export function knowledgeWindowCache(storage:AugmentedPort){
 let entries:z.infer<typeof Entries>|undefined
 const list=async()=>entries||=(Entries.parse(await storage.get(MANIFEST)||[]))
 return {
  get:async(key:string)=>{await storage.check();const entry=(await list()).find(row=>row.key===key);if(!entry)return undefined;const record=Record.parse(await storage.get(entry.alias));if(record.key!==key)throw Error('Invalid knowledge window cache binding');entries=[...(await list()).filter(row=>row.key!==key),entry];return record.value},
  put:async(key:string,value:KnowledgeExtraction,fileId:string)=>{await storage.check();digest.parse(key);KnowledgeExtractionSchema.parse(value);const before=await list(),path='.chatbox/knowledge/data/'+crypto.randomUUID()+'.json',next=[...before.filter(row=>row.key!==key),{key,alias:path,fileId}],evicted=next.splice(0,Math.max(0,next.length-64));try{await storage.put(path,{key,value});await storage.check();await storage.put(MANIFEST,next);entries=next}catch(error){await storage.remove(path).catch(()=>{});throw error}for(const old of [...evicted,...before.filter(row=>row.key===key)])await storage.remove(old.alias).catch(()=>{})},
 }
}
