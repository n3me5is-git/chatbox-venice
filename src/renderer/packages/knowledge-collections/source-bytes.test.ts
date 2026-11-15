import {expect,it,vi} from 'vitest'
import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {KNOWLEDGE_BASE_MAX_FILE_SIZE as MAX,KNOWLEDGE_SOURCE_CHUNK_BYTES as CHUNK} from '@shared/knowledge-base'
import {knowledgeFileSource,knowledgeSourceHash} from './source-bytes'
it('accepts exactly 50 MiB using one MiB slices and a matching incremental SHA-256',async()=>{
 const part=new Uint8Array(CHUNK).fill(53),file=new Blob(Array.from({length:50},()=>part)),full=vi.spyOn(file,'arrayBuffer'),source=knowledgeFileSource(file,async()=>{}),hash=sha256.create();let count=0,total=0
 for await(const bytes of source.chunks){expect(bytes.length).toBeLessThanOrEqual(CHUNK);hash.update(bytes);total+=bytes.length;count++}
 expect(total).toBe(MAX);expect(count).toBe(50);expect(source.digest()).toBe(bytesToHex(hash.digest()));expect(full).not.toHaveBeenCalled()
})
it('rejects oversized sources before reading and clears a yielded plaintext chunk on cancellation',async()=>{
 const read=vi.fn();expect(()=>knowledgeFileSource({size:MAX+1,arrayBuffer:read} as unknown as Blob,async()=>{})).toThrow('50 MB');expect(read).not.toHaveBeenCalled()
 const source=knowledgeFileSource(new Blob([new Uint8Array(CHUNK+1).fill(7)]),async()=>{}),iterator=source.chunks[Symbol.asyncIterator](),chunk=(await iterator.next()).value!;expect(chunk[0]).toBe(7);await iterator.return?.(undefined);expect(chunk.every(byte=>byte===0)).toBe(true);expect(()=>source.digest()).toThrow('Incomplete')
})
it('preserves small File-like adapters while requiring bounded reads for large ones',async()=>{
 const source=knowledgeFileSource({size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer} as Blob,async()=>{});for await(const _ of source.chunks){}expect(source.digest()).toBe(bytesToHex(sha256(new Uint8Array([1,2,3]))));const large=knowledgeFileSource({size:CHUNK+1,arrayBuffer:vi.fn()} as Blob,async()=>{});await expect(large.chunks.next()).rejects.toThrow('bounded reads')
})
it('matches native digest conventions without allocating a source-sized copy',async()=>{const bytes=new Uint8Array(CHUNK+1).fill(42);expect(await knowledgeSourceHash(bytes)).toBe(bytesToHex(sha256(bytes)));expect(bytes.at(-1)).toBe(42)})
