import {z} from 'zod'
import {RagChunkSchema,type RagChunk} from './session-rag'

const FORMAT='float32-le-v1'
const PackedVectorSchema=z.object({encoding:z.literal(FORMAT),dimensions:z.number().int().min(1).max(8192),data:z.string().max(43692)}).strict()
type Base64Bytes=Uint8Array&{toBase64?():string}
const encodeBytes=(bytes:Uint8Array)=>{if((bytes as Base64Bytes).toBase64)return (bytes as Base64Bytes).toBase64!();let text='';for(let start=0;start<bytes.length;start+=8192)text+=String.fromCharCode(...bytes.subarray(start,start+8192));return btoa(text)}

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
 // Reject noncanonical padding and discarded low bits without re-encoding all
 // vector bytes. New browsers use the native decoder; old WebViews keep atob.
 const padding=(3-expected%3)%3,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
 if((packed.data.match(/=+$/)?.[0].length||0)!==padding||padding&&(alphabet.indexOf(packed.data.at(-padding-1)!)&((1<<(padding*2))-1))!==0)throw Error('Invalid packed embedding encoding')
 const native=(Uint8Array as typeof Uint8Array&{fromBase64?(text:string):Uint8Array}).fromBase64
 const bytes=native?native.call(Uint8Array,packed.data):Uint8Array.from(atob(packed.data),char=>char.charCodeAt(0))
 try{if(bytes.length!==expected)throw Error('Invalid packed embedding length');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),vector=new Array<number>(packed.dimensions);for(let n=0;n<vector.length;n++){const value=view.getFloat32(n*4,true);if(!Number.isFinite(value))throw Error('Invalid packed embedding value');vector[n]=value}return {...metadata,vector}}finally{bytes.fill(0)}
}

export function unpackRagShard(value:unknown):RagChunk[]{
 if(!Array.isArray(value)||value.length>32)throw Error('Invalid RAG shard')
 return value.map(unpackRagChunk)
}
