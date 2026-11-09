import { describe, expect, it } from 'vitest'
import { SessionFileStore, type SessionFileStorage } from './session-file-store'
import type { SessionResourceIndex } from './session-resources'
function fixture() {
  const indices=new Map<string,SessionResourceIndex>(), bytes=new Map<string,Uint8Array>(); let locked=false, fail=false
  const storage:SessionFileStorage={assertAccess:async()=>{if(locked)throw Error('Locked')},loadIndex:async id=>indices.get(id)??null,saveIndex:async(id,index)=>{if(fail)throw Error('Storage failed');indices.set(id,structuredClone(index))},read:async key=>bytes.get(key)!,put:async(_id,key,data)=>{bytes.set(key,data.slice())},remove:async key=>{bytes.delete(key)}}
  return {store:new SessionFileStore(storage),indices,bytes,lock(){locked=true},fail(){fail=true}}
}
describe('persistent session files',()=>{
  it('supports empty text files without confusing them with a missing file',async()=>{const f=fixture();await f.store.write('one','empty.txt',new Uint8Array());expect((await f.store.read('one','empty.txt')).bytes.length).toBe(0)})
  it('isolates sessions and retains concurrent writes without reading content for listing',async()=>{
    const f=fixture();await Promise.all(['a.md','b.js'].map(path=>f.store.write('one',path,new TextEncoder().encode(path))))
    expect(await f.store.list('two')).toEqual([]);expect(await f.store.list('one')).toHaveLength(2)
    expect((await f.store.list('one')).every(file=>!('content'in file)&&file.deliverable===false)).toBe(true)
  })
  it('deletes an individual file and its bytes; a different file stays readable',async()=>{
    const f=fixture(),a=await f.store.write('one','a.md',new Uint8Array([1]));await f.store.write('one','b.md',new Uint8Array([2]))
    await f.store.remove('one',a.id);expect(f.bytes.has(a.key)).toBe(false);expect((await f.store.read('one','b.md')).bytes).toEqual(new Uint8Array([2]))
  })
  it('rolls back uncommitted bytes if index persistence fails',async()=>{
    const f=fixture();await f.store.write('one','a.md',new Uint8Array([1]));f.fail()
    await expect(f.store.write('one','a.md',new Uint8Array([2]))).rejects.toThrow('Storage failed')
    expect(f.bytes.size).toBe(1);expect((await f.store.read('one','a.md')).bytes).toEqual(new Uint8Array([1]))
  })
  it('gates metadata, content and mutation when the project is locked',async()=>{
    const f=fixture();const file=await f.store.write('one','a.md',new Uint8Array([1]));f.lock()
    await expect(f.store.list('one')).rejects.toThrow('Locked');await expect(f.store.read('one','a.md')).rejects.toThrow('Locked');await expect(f.store.remove('one',file.id)).rejects.toThrow('Locked')
  })
  it('keeps delivery explicit and session Python disabled until chosen',async()=>{
    const f=fixture();await f.store.write('one','report.md',new Uint8Array([1]));await f.store.deliver('one','report.md')
    expect((await f.store.list('one'))[0].deliverable).toBe(true);expect((await f.store.index('one')).pythonEnabled).toBeUndefined()
    await f.store.python('one',true);expect((await f.store.index('one')).pythonEnabled).toBe(true);expect((await f.store.index('two')).pythonEnabled).toBeUndefined()
  })
})

it('copies linked deliverables into encrypted managed storage without moving the source file',async()=>{
 const f=fixture();const source={id:'linked-source',origin:'file',path:'result.md',name:'result.md',key:'linked:one:result.md:binding~hash',mime:'text/markdown',bytes:4,updatedAt:1} as const
 f.indices.set('one',{version:1,files:[source],removed:[]});f.bytes.set(source.key,new Uint8Array([1,2,3,4]))
 const delivered=await f.store.deliver('one','result.md');expect(delivered.path).toMatch(/^\.chatbox\/deliverables\//);expect(delivered.deliverable).toBe(true);expect(delivered.path.length).toBeLessThanOrEqual(240);expect(f.bytes.get(source.key)).toEqual(new Uint8Array([1,2,3,4]));expect(f.bytes.get(delivered.key)).toEqual(new Uint8Array([1,2,3,4]));expect(await f.store.list('one')).toHaveLength(2)
})
