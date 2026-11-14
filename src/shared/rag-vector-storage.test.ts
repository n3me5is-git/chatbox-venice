import {expect,it,vi} from 'vitest'
import {normalizedVector,cosine,type RagChunk} from './session-rag'
import {packRagShard,unpackRagChunk,unpackRagShard} from './rag-vector-storage'
const fixture=(dimensions=4096):RagChunk=>({id:crypto.randomUUID(),path:'docs/report.md',sourceHash:'a'.repeat(64),text:'The exact source passage.',line:4,endLine:4,page:2,vector:normalizedVector(Array.from({length:dimensions},(_,n)=>Math.sin(n*.73+.2)))})
it('preserves passage identity and cosine ranking within float32 error with substantially smaller4096-dimensional storage',()=>{
 const chunk=fixture(),other=fixture();other.vector=normalizedVector(other.vector.map((value,n)=>value+Math.cos(n*.31)*.0001));const packed=packRagShard([chunk,other]),decoded=unpackRagShard(JSON.parse(JSON.stringify(packed)))
 expect(decoded[0]).toMatchObject({id:chunk.id,sourceHash:chunk.sourceHash,text:chunk.text,line:4,endLine:4,page:2});expect(decoded[0].vector).toHaveLength(4096)
 expect(Math.abs(cosine(chunk.vector,other.vector)-cosine(normalizedVector(decoded[0].vector),normalizedVector(decoded[1].vector)))).toBeLessThan(1e-7)
 expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify([chunk,other]).length*.4)
})
it('reads legacy and compact shards together without changing old vectors or source IDs',()=>{
 const old=fixture(128),next=fixture(1024),rows=unpackRagShard([old,...packRagShard([next])]);expect(rows[0]).toEqual(old);expect(rows.map(row=>row.id)).toEqual([old.id,next.id]);expect(rows[1].vector).toHaveLength(1024)
})
it('rejects malformed sizes, encodings, non-finite floats and oversized shards before retrieval',()=>{
 const packed=packRagShard([fixture(128)])[0],change=(vector:unknown)=>({...packed,vector})
 expect(()=>unpackRagChunk(change({...packed.vector,dimensions:129}))).toThrow();expect(()=>unpackRagChunk(change({...packed.vector,data:packed.vector.data.slice(4)}))).toThrow();expect(()=>unpackRagChunk(change({...packed.vector,data:'!'.repeat(packed.vector.data.length)}))).toThrow();expect(()=>unpackRagChunk(change({...packed.vector,encoding:'other'}))).toThrow()
 const invalid=new Uint8Array(4);new DataView(invalid.buffer).setFloat32(0,NaN,true);expect(()=>unpackRagChunk(change({encoding:'float32-le-v1',dimensions:1,data:btoa(String.fromCharCode(...invalid))}))).toThrow();expect(()=>unpackRagShard(Array.from({length:33},()=>packed))).toThrow()
})

it('uses identical strict validation with native and fallback base64 decoders',()=>{
 const packed=packRagShard([fixture(1)])[0],descriptor=Object.getOwnPropertyDescriptor(Uint8Array,'fromBase64'),native=vi.fn((text:string)=>Uint8Array.from(atob(text),char=>char.charCodeAt(0)))
 try{Object.defineProperty(Uint8Array,'fromBase64',{configurable:true,value:native});const current=unpackRagChunk(packed);expect(native).toHaveBeenCalledOnce();Object.defineProperty(Uint8Array,'fromBase64',{configurable:true,value:undefined});expect(unpackRagChunk(packed)).toEqual(current);expect(()=>unpackRagChunk({...packed,vector:{...packed.vector,data:'AACAPx=='}})).toThrow('encoding')}finally{if(descriptor)Object.defineProperty(Uint8Array,'fromBase64',descriptor);else delete (Uint8Array as any).fromBase64}
})
