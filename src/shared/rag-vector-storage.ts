import {z} from 'zod'
import {RagChunkSchema,type RagChunk} from './session-rag'

const FORMAT='float32-le-v1'
const PackedVectorSchema=z.object({encoding:z.literal(FORMAT),dimensions:z.number().int().min(1).max(8192),data:z.string().max(43692)}).strict()
const encodeBytes=(bytes:Uint8Array)=>{let text='';for(let start=0;start<bytes.length;start+=8192)text+=String.fromCharCode(...bytes.subarray(start,start+8192));return btoa(text)}

/** Compact numerical storage only. Encryption and source/endpoint bindings stay
 * in the host storage layer; this is not a replacement for authenticated storage. */
export function packRagShard(chunks:readonly RagChunk[]){
 if(chunks.length>32)throw Error('Invalid RAG shard')
 return chunks.map(value=>{const chunk=RagChunkSchema.parse(value),bytes=new Uint8Array(chunk.vector.length*4),view=new DataView(bytes.buffer)
  for(let n=0;n<chunk.vector.length;n++){view.setFloat32(n*4,chunk.vector[n],true);if(!Number.isFinite(view.getFloat32(n*4,true)))throw Error('Embedding exceeds float32 storage range')}
  const data=encodeBytes(bytes);bytes.fill(0);return {...chunk,vector:{encoding:FORMAT,dimensions:chunk.vector.length,data}}
 })
}

/** Old JSON number arrays remain readable. Unchanged legacy shards need no
 * migration and no new embedding calls; only newly written shards use float32. */
export function unpackRagChunk(value:unknown):RagChunk{
 if(value&&typeof value==='object'&&Array.isArray((value as {vector?:unknown}).vector))return RagChunkSchema.parse(value)
 const metadata=RagChunkSchema.omit({vector:true}).parse(value),packed=PackedVectorSchema.parse((value as {vector?:unknown})?.vector),expected=packed.dimensions*4
 if(packed.data.length!==Math.ceil(expected/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(packed.data))throw Error('Invalid packed embedding')
 const text=atob(packed.data);if(text.length!==expected)throw Error('Invalid packed embedding length')
 const bytes=Uint8Array.from(text,char=>char.charCodeAt(0));if(encodeBytes(bytes)!==packed.data)throw Error('Invalid packed embedding encoding')
 const view=new DataView(bytes.buffer),vector=Array.from({length:packed.dimensions},(_,n)=>view.getFloat32(n*4,true));bytes.fill(0)
 return RagChunkSchema.parse({...metadata,vector})
}

export function unpackRagShard(value:unknown):RagChunk[]{
 if(!Array.isArray(value)||value.length>32)throw Error('Invalid RAG shard')
 return value.map(unpackRagChunk)
}
