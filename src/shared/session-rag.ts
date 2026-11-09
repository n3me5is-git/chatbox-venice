import { z } from 'zod'
export const RAG_ROOT='.chatbox/rag/'
export const RagSettingsSchema=z.object({version:z.literal(1).default(1),enabled:z.boolean().default(false),provider:z.string().default(''),model:z.string().default(''),auto:z.boolean().default(false),images:z.boolean().default(false),audio:z.boolean().default(false),ocr:z.boolean().default(false),ocrProvider:z.string().default(''),ocrModel:z.string().default(''),exclude:z.array(z.string().max(240)).max(100).default(['node_modules','.git','.venv','venv','dist','build','.env']),dimensions:z.number().int().min(128).max(8192).optional()})
export type RagSettings=z.infer<typeof RagSettingsSchema>
export interface RagChunk {id:string;path:string;sourceHash:string;text:string;line:number;endLine:number;page?:number;vector:number[];modality?:string}
export interface RagFile {path:string;hash:string;shards:string[];chunks:number;warning?:string}
export interface RagIndex {version:1;fingerprint:string;updated:number;files:RagFile[];errors:{path:string;error:string}[]}
const sourcePath=z.string().min(1).max(240).refine(path=>!path.startsWith('.chatbox/')&&!path.split('/').some(part=>part==='..'||part==='.')&&!/[\\\u0000-\u001f]/.test(path))
export const RagIndexSchema=z.object({version:z.literal(1),fingerprint:z.string().max(4096),updated:z.number().finite(),files:z.array(z.object({path:sourcePath,hash:z.string().regex(/^[a-f0-9]{64}$/),shards:z.array(z.string().regex(/^\.chatbox\/rag\/data\/[a-f0-9-]+\.json$/)).max(625),chunks:z.number().int().min(0).max(20000),warning:z.string().max(500).optional()})).max(2000),errors:z.array(z.object({path:z.string().max(240),error:z.string().max(500)})).max(2000)}).refine(index=>index.files.reduce((n,file)=>n+file.chunks,0)<=20000)
export const RagChunkSchema=z.object({id:z.string().uuid(),path:sourcePath,sourceHash:z.string().regex(/^[a-f0-9]{64}$/),text:z.string().max(2000),line:z.number().int().min(1),endLine:z.number().int().min(1),page:z.number().int().min(1).optional(),vector:z.array(z.number().finite()).min(1).max(8192),modality:z.string().max(100).optional()})
export const ragCitation=(path:string)=>'sandbox:/mnt/data/'+path.split('/').map(encodeURIComponent).join('/')
export function ragExcluded(path:string,settings:RagSettings){return path.startsWith('.chatbox/')||path.split('/').some(part=>settings.exclude.includes(part))||settings.exclude.some(prefix=>prefix&&path.startsWith(prefix.replace(/\/$/,'')+'/'))}
export function chunkRagText(text:string){
  if(text.length>500000)throw Error('Document text exceeds the indexing limit')
  const lines=text.replace(/\r\n?/g,'\n').split('\n'),result:{text:string;line:number;endLine:number;page?:number}[]=[]
  let page:number|undefined
  for(let at=0;at<lines.length;){const start=at;let content='';const marker=/^==== Page (\d+) ====$/.exec(lines[at]);if(marker)page=Number(marker[1]);while(at<lines.length&&content.length+lines[at].length<1800){content+=lines[at]+'\n';at++;if(at>start&&/^==== Page \d+ ====$/.test(lines[at]||''))break}if(at===start){for(let offset=0;offset<lines[at].length;offset+=1600)result.push({text:lines[at].slice(offset,offset+1800),line:at+1,endLine:at+1,page});at++}else if(content.trim())result.push({text:content.trim(),line:start+1,endLine:at,page})}
  return result
}
export function normalizedVector(value:unknown):number[]{if(!Array.isArray(value)||!value.length||value.length>8192||value.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw Error('Invalid embedding vector');const norm=Math.hypot(...value);if(!norm)throw Error('Invalid embedding vector');return value.map(n=>n/norm)}
export function cosine(left:number[],right:number[]){if(left.length!==right.length)throw Error('Embedding dimensions changed; rebuild the index');let score=0;for(let i=0;i<left.length;i++)score+=left[i]*right[i];return score}
