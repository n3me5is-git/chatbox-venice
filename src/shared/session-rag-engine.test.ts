import { expect,it,vi } from 'vitest'
import { SessionRagEngine, type RagEnginePort } from './session-rag-engine'
import { RAG_ROOT, RagSettingsSchema, chunkRagText } from './session-rag'
function fixture(){
  const sources=new Map([['docs/cats.md','Cats sleep in the sun.'],['src/dogs.ts','Dogs fetch a ball.'],['.chatbox/rag/index.json','never index this'],['node_modules/dependency.js','exclude this']]),db=new Map<string,any>(),settings=RagSettingsSchema.parse({enabled:true,provider:'fake',model:'embed'}),signal=new AbortController()
  const embed=vi.fn(async(input:any[])=>input.map(input=>input.text?.toLowerCase().includes('cat')?[1,0]:[0,1]))
  const port:RagEnginePort={list:async()=>[...sources].map(([path,text])=>({path,mime:'text/plain',bytes:text.length})),read:async path=>{if(!sources.has(path))throw Error('Not found');return new TextEncoder().encode(sources.get(path))},get:async path=>structuredClone(db.get(path)??null),put:async(path,value)=>{db.set(path,structuredClone(value))},remove:async path=>{db.delete(path)},extract:async(_source,bytes)=>({text:new TextDecoder().decode(bytes)}),embed,check:async()=>{if(signal.signal.aborted)throw Error('Locked')}}
  return {sources,db,settings,signal,embed,port,engine:new SessionRagEngine(port)}
}
it('indexes only source files, reuses SHA-256 unchanged files and replaces/deletes changed vectors',async()=>{
  const f=fixture(),first=await f.engine.index(f.settings,f.signal.signal);expect(first.files.map(file=>file.path)).toEqual(['docs/cats.md','src/dogs.ts']);expect(f.embed).toHaveBeenCalledTimes(2)
  const before=[...f.db.keys()];await f.engine.index(f.settings,f.signal.signal);expect(f.embed).toHaveBeenCalledTimes(2)
  f.sources.set('docs/cats.md','Cats climb trees.');f.sources.delete('src/dogs.ts');const next=await f.engine.index(f.settings,f.signal.signal)
  expect(next.files).toHaveLength(1);expect(f.embed).toHaveBeenCalledTimes(3);expect(before.filter(path=>path.includes('/data/')).every(path=>!f.db.has(path))).toBe(true)
})
it('searches semantically and retrieves bounded passages with clickable source and line references',async()=>{
  const f=fixture();await f.engine.index(f.settings,f.signal.signal);const results=await f.engine.search('cat',f.settings,f.signal.signal,1)
  expect(results.matches[0]).toMatchObject({path:'docs/cats.md',line:1,url:'sandbox:/mnt/data/docs/cats.md',score:1})
  const read=await f.engine.retrieve([results.matches[0].id],f.settings,f.signal.signal);expect(read.passages[0]).toMatchObject({content:'Cats sleep in the sun.',path:'docs/cats.md'});expect(read.instruction).toContain('untrusted')
})
it('does not return deleted or modified source passages and rejects stale retrieval IDs',async()=>{
  const f=fixture();await f.engine.index(f.settings,f.signal.signal);const {matches}=await f.engine.search('cat',f.settings,f.signal.signal,1);f.sources.set('docs/cats.md','Changed after indexing')
  expect((await f.engine.search('cat',f.settings,f.signal.signal,1)).matches.some(row=>row.path==='docs/cats.md')).toBe(false)
  await expect(f.engine.retrieve([matches[0].id],f.settings,f.signal.signal)).rejects.toThrow('source changed')
  f.sources.delete('docs/cats.md');expect((await f.engine.search('cat',f.settings,f.signal.signal,1)).matches.some(row=>row.path==='docs/cats.md')).toBe(false)
})
it('keeps the previous committed index and clears staged shards when cancelled',async()=>{
  const f=fixture();await f.engine.index(f.settings,f.signal.signal);const previous=structuredClone(f.db.get(RAG_ROOT+'index.json'));f.sources.set('docs/cats.md','Cats changed')
  f.port.put=async(path,value)=>{f.db.set(path,value);if(path.includes('/data/'))f.signal.abort()}
  await expect(f.engine.index(f.settings,f.signal.signal)).rejects.toThrow();expect(f.db.get(RAG_ROOT+'index.json')).toEqual(previous)
  expect([...f.db.keys()].filter(path=>path.includes('/data/')).length).toBe(previous.files.length)
})
it('stops on provider errors rather than repeatedly sending every file',async()=>{
  const f=fixture();f.embed.mockRejectedValue(Object.assign(Error('Provider unavailable'),{fatal:true}));await expect(f.engine.index(f.settings,f.signal.signal)).rejects.toThrow('Provider unavailable');expect(f.embed).toHaveBeenCalledOnce();expect(f.db.size).toBe(0)
})
it('rejects model/dimension changes and invalid vector payloads',async()=>{
  const f=fixture();await f.engine.index(f.settings,f.signal.signal)
  await expect(f.engine.search('cat',{...f.settings,model:'another'},f.signal.signal)).rejects.toThrow('selected model')
  f.embed.mockResolvedValue([[1,2,3]]);await expect(f.engine.search('cat',f.settings,f.signal.signal)).rejects.toThrow('dimensions')
})
it('retains PDF page markers and splits long script lines without unbounded chunks',()=>{
  const chunks=chunkRagText('==== Page 3 ====\nHello\n'+'x'.repeat(6000));expect(chunks[0].page).toBe(3);expect(chunks.every(chunk=>chunk.text.length<=2000)).toBe(true);expect(chunks.at(-1)?.line).toBe(3)
})
it('indexes optional multimodal media without retaining raw media bytes in its vector shards',async()=>{
  const f=fixture();f.port.list=async()=>[{path:'photo.png',mime:'image/png',bytes:3}];f.port.read=async()=>new Uint8Array([1,2,3]);f.port.extract=async()=>({media:true});await f.engine.index({...f.settings,images:true},f.signal.signal)
  expect(f.embed.mock.calls[0][0][0].data).toBeInstanceOf(Uint8Array);const rows=[...f.db.values()].filter(Array.isArray).flat();expect(rows[0]).toMatchObject({path:'photo.png',modality:'image/png',text:''});expect(rows[0].data).toBeUndefined()
})
