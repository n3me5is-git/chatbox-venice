import {z} from 'zod'

const digest=z.string().regex(/^[a-f0-9]{64}$/)
const fields={kind:z.enum(['parsed','ocr','transcript','description','metadata']),sourceHash:digest,textHash:digest,fingerprint:digest,warning:z.string().max(500).optional()}
export const KnowledgeTextSchema=z.object({version:z.literal(1),text:z.string().max(512000),...fields}).strict()
export type KnowledgeText=z.infer<typeof KnowledgeTextSchema>
const PackedTextSchema=z.object({version:z.literal(2),encoding:z.literal('gzip-base64-v1'),utf8Bytes:z.number().int().min(1).max(2048000),data:z.string().min(1).max(2730700),...fields}).strict()
export type StoredKnowledgeText=KnowledgeText|z.infer<typeof PackedTextSchema>
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true})
const byteStream=(bytes:Uint8Array)=>new ReadableStream<Uint8Array<ArrayBuffer>>({start(controller){controller.enqueue(Uint8Array.from(bytes));controller.close()}})
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)))).map(n=>n.toString(16).padStart(2,'0')).join('')
function encode(bytes:Uint8Array){let text='';for(let n=0;n<bytes.length;n+=32768)text+=String.fromCharCode(...bytes.subarray(n,n+32768));return btoa(text)}
function decode(value:string){if(value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Invalid compressed knowledge text');const binary=atob(value),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(encode(bytes)!==value)throw Error('Invalid compressed knowledge text');return bytes}
async function collect(stream:ReadableStream<Uint8Array>,maximum:number){const reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>maximum){await reader.cancel();throw Error('Knowledge text exceeds the decompression limit')}chunks.push(next.value)}const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}return result}finally{for(const chunk of chunks)chunk.fill(0);reader.releaseLock()}}
/** Compress only derived text, before the existing asset encryption. Hashes and
 * citation offsets always describe the original UTF-8/LF text, never gzip bytes. */
export async function packKnowledgeText(input:unknown):Promise<StoredKnowledgeText>{
 const value=KnowledgeTextSchema.parse(input),bytes=encoder.encode(value.text)
 if(bytes.length<4096||typeof CompressionStream==='undefined'){bytes.fill(0);return value}
 let packed:Uint8Array|undefined
 try{packed=await collect(byteStream(bytes).pipeThrough(new CompressionStream('gzip')),2097152);const data=encode(packed);if(data.length+128>=bytes.length*0.9)return value;const {text:_,version:__,...metadata}=value;return {version:2,encoding:'gzip-base64-v1',utf8Bytes:bytes.length,data,...metadata}}finally{bytes.fill(0);packed?.fill(0)}
}
export async function unpackKnowledgeText(input:unknown):Promise<KnowledgeText>{
 if((input as {version?:unknown}|null)?.version!==2)return KnowledgeTextSchema.parse(input)
 const value=PackedTextSchema.parse(input)
 if(typeof DecompressionStream==='undefined')throw Error('This device cannot read compressed knowledge text')
 const packed=decode(value.data);let bytes:Uint8Array|undefined
 try{bytes=await collect(byteStream(packed).pipeThrough(new DecompressionStream('gzip')),value.utf8Bytes);if(bytes.length!==value.utf8Bytes||await hash(bytes)!==value.textHash)throw Error('Invalid knowledge text revision');const {encoding:_,data:__,utf8Bytes:___,version:____,...metadata}=value;return KnowledgeTextSchema.parse({version:1,text:decoder.decode(bytes),...metadata})}finally{packed.fill(0);bytes?.fill(0)}
}
