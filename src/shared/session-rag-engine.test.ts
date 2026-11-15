import { expect,it,vi } from 'vitest'
import { SessionRagEngine, type RagEnginePort } from './session-rag-engine'
import { RAG_ROOT, RagSettingsSchema, chunkRagText } from './session-rag'
function fixture(){
  const sources=new Map([['docs/cats.md','Cats sleep in the sun.'],['src/dogs.ts','Dogs fetch a ball.'],['.chatbox/rag/index.json','never index this'],['node_modules/dependency.js','exclude this']]),db=new Map<string,any>(),settings=RagSettingsSchema.parse({enabled:true,provider:'fake',model:'embed'}),signal=new AbortController()
  const embed=vi.fn(async(input:any[])=>input.map(input=>input.text?.toLowerCase().includes('cat')?[1,0]:[0,1]))
  const port:RagEnginePort={list:async()=>[...sources].map(([path,text])=>({path,mime:'text/plain',bytes:text.length})),read:async path=>{if(!sources.has(path))throw Error('Not found');return new TextEncoder().encode(sources.get(path))},get:async path=>structuredClone(db.get(path)??null),put:async(path,value)=>{db.set(path,structuredClone(value))},remove:async path=>{db.delete(path)},extract:async(_source,bytes)=>({text:new TextDecoder().decode(bytes)}),embed,check:async()=>{if(signal.signal.aborted)throw Error('Locked')}}
  return {sources,db,settings,signal,embed,port,engine:new SessionRagEngine(port)}
}
it('allows a KB source above 10 MiB while ordinary session RAG keeps its original bound',async()=>{
 const source={path:'large.pdf',mime:'application/pdf',bytes:11*1024*1024},regular=fixture();regular.port.list=async()=>[source];const read=vi.fn(async()=>new Uint8Array(source.bytes));regular.port.read=read;expect((await regular.engine.index(regular.settings,regular.signal.signal)).errors[0].error).toContain('10 MB');expect(read).not.toHaveBeenCalled()
 const kb=fixture();kb.port.sourceMaxBytes=50*1024*1024;kb.port.list=async()=>[source];kb.port.read=read;kb.port.hashSource=vi.fn(async()=>'a'.repeat(64));kb.port.extract=async()=>({text:'A large source with a small extracted body'});expect((await kb.engine.index(kb.settings,kb.signal.signal)).files).toHaveLength(1);expect(kb.port.hashSource).toHaveBeenCalledOnce()
})
it('rejects oversized KB metadata before reading and independently rejects an oversized body',async()=>{const f=fixture();f.port.sourceMaxBytes=50*1024*1024;f.port.list=async()=>[{path:'large.pdf',mime:'application/pdf',bytes:50*1024*1024+1}];const read=vi.fn(async()=>new Uint8Array(50*1024*1024+1));f.port.read=read;expect((await f.engine.index(f.settings,f.signal.signal)).errors[0].error).toContain('50 MB');expect(read).not.toHaveBeenCalled();f.port.list=async()=>[{path:'large.pdf',mime:'application/pdf',bytes:1}];expect((await f.engine.index(f.settings,f.signal.signal)).errors[0].error).toContain('50 MB');expect(f.embed).not.toHaveBeenCalled()})
it('reuses matching text vectors after an OCR policy change, while re-extracting and keeping embedding-space boundaries',async()=>{const f=fixture();await f.engine.index(f.settings,f.signal.signal);expect(f.embed).toHaveBeenCalledTimes(2);const next=await f.engine.index({...f.settings,ocr:true,pdfOcrMode:'all'},f.signal.signal);expect(f.embed).toHaveBeenCalledTimes(2);expect(next.stats?.reusedChunks).toBe(2);await f.engine.index({...f.settings,model:'different-embedding',ocr:true,pdfOcrMode:'all'},f.signal.signal);expect(f.embed).toHaveBeenCalledTimes(4)})
it('changes only PDF extraction when toggling all-page OCR and still notices modified images',async()=>{const f=fixture();f.sources.clear();f.sources.set('scan.pdf','PDF text');f.sources.set('photo.png','Photo text');const extract=vi.fn(f.port.extract);f.port.extract=extract;const settings={...f.settings,ocr:true};await f.engine.index(settings,f.signal.signal);extract.mockClear();f.embed.mockClear();const next=await f.engine.index({...settings,pdfOcrMode:'all'},f.signal.signal);expect(extract).toHaveBeenCalledTimes(1);expect(extract.mock.calls[0][0].path).toBe('scan.pdf');expect(next.stats?.unchangedFiles).toBe(1);expect(f.embed).not.toHaveBeenCalled();extract.mockClear();f.sources.set('photo.png','Modified photo text');await f.engine.index({...settings,pdfOcrMode:'all'},f.signal.signal);expect(extract).toHaveBeenCalledTimes(1);expect(extract.mock.calls[0][0].path).toBe('photo.png')})
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

it('does not destroy a committed index when deleting an obsolete shard fails',async()=>{
 const f=fixture();await f.engine.index(f.settings,f.signal.signal);f.sources.set('docs/cats.md','Cats changed');f.port.remove=async()=>{throw Error('Cleanup unavailable')}
 await f.engine.index(f.settings,f.signal.signal);expect((await f.engine.search('cat',f.settings,f.signal.signal)).matches[0].snippet).toContain('changed')
})

it('stops at the first storage failure instead of paying to embed the remaining files',async()=>{
 const f=fixture();f.port.put=async()=>{throw Error('Storage full')};await expect(f.engine.index(f.settings,f.signal.signal)).rejects.toThrow('Storage full');expect(f.embed).toHaveBeenCalledOnce();expect(f.db.size).toBe(0)
})

it('explicitly rebuilds unchanged documents while default indexing keeps its incremental behavior',async()=>{
 const f=fixture();const first=await f.engine.index(f.settings,f.signal.signal);await f.engine.index(f.settings,f.signal.signal);expect(f.embed).toHaveBeenCalledTimes(2)
 await f.engine.index(f.settings,f.signal.signal,()=>{},true);expect(f.embed).toHaveBeenCalledTimes(4)
 expect(first.files.flatMap(file=>file.shards).every(shard=>!f.db.has(shard))).toBe(true)
})

it('preserves existing index fingerprints until transcription is explicitly enabled',async()=>{
 const f=fixture();await f.engine.index(f.settings,f.signal.signal);await expect(f.engine.search('cat',{...f.settings,stt:false},f.signal.signal)).resolves.toBeTruthy();await expect(f.engine.search('cat',{...f.settings,stt:true,sttProvider:'speech',sttModel:'asr'},f.signal.signal)).rejects.toThrow('selected model')
})

it('reuses unchanged text chunks within a modified source and embeds only novel passage inputs',async()=>{
 const f=fixture();f.sources.clear();const text=Array.from({length:12},(_,n)=>'Section '+n+'\n'+('cats-'+n+' ').repeat(125)).join('\n\n');f.sources.set('long.md',text);const first=await f.engine.index(f.settings,f.signal.signal),oldTexts=new Set([...f.db.values()].filter(Array.isArray).flat().map(chunk=>chunk.text));f.embed.mockClear()
 f.sources.set('long.md',text.replace('Section 5','Updated 5'));const next=await f.engine.index(f.settings,f.signal.signal),inputs=f.embed.mock.calls.flatMap(call=>call[0])
 expect(next.stats!.embeddedChunks).toBe(inputs.length);expect(next.stats!.reusedChunks).toBeGreaterThan(0);expect(inputs.length).toBeGreaterThan(0);expect(inputs.length).toBeLessThan(first.files[0].chunks);expect(inputs.every(input=>!oldTexts.has(input.text))).toBe(true)
 const rows=next.files[0].shards.flatMap(path=>f.db.get(path));expect(rows.every(chunk=>chunk.sourceHash===next.files[0].hash)).toBe(true);expect(next.files[0].hash).not.toBe(first.files[0].hash)
 f.embed.mockClear();const rebuilt=await f.engine.index(f.settings,f.signal.signal,()=>{},true);expect(rebuilt.stats!.embeddedChunks).toBeGreaterThan(inputs.length)
})
it('updates source provenance without embedding when only parsed-container bytes change',async()=>{
 const f=fixture();f.sources.clear();f.sources.set('document.pdf','container-v1');f.port.extract=async()=>({text:'Exactly the same parsed document.'});await f.engine.index(f.settings,f.signal.signal);f.embed.mockClear();f.sources.set('document.pdf','container-v2');const next=await f.engine.index(f.settings,f.signal.signal)
 expect(f.embed).not.toHaveBeenCalled();expect(next.stats).toEqual({embeddedChunks:0,reusedChunks:1,unchangedFiles:0})
})

it('refuses incompatible endpoint spaces before charging provider calls, and rebuilds only on explicit request',async()=>{
 const f=fixture();f.port.embeddingSpace='a'.repeat(64);await f.engine.index(f.settings,f.signal.signal);f.embed.mockClear();f.port.embeddingSpace='b'.repeat(64)
 await expect(f.engine.search('cat',f.settings,f.signal.signal)).rejects.toThrow('Reindex');await expect(f.engine.index(f.settings,f.signal.signal)).rejects.toThrow('Reindex');expect(f.embed).not.toHaveBeenCalled();const rebuilt=await f.engine.index(f.settings,f.signal.signal,()=>{},true);expect(rebuilt.embeddingSpace).toBe('b'.repeat(64));expect(f.embed).toHaveBeenCalled()
})

it('indexes a native image vector and its opt-in description separately and reuses both unchanged',async()=>{const f=fixture();f.sources.clear();f.sources.set('flow.png','synthetic image bytes');f.port.list=async()=>[{path:'flow.png',mime:'image/png'}];f.port.extract=async()=>({media:true,text:'AI-generated visual description (inferred): A three-stage blue flowchart.'});const cfg=RagSettingsSchema.parse({...f.settings,images:true,describeImages:true});const result=await f.engine.index(cfg,f.signal.signal);expect(result.files[0].chunks).toBe(2);expect(f.embed.mock.calls[0][0]).toEqual([expect.objectContaining({data:expect.any(Uint8Array),mime:'image/png'}),expect.objectContaining({text:expect.stringContaining('blue flowchart')})]);f.embed.mockClear();await f.engine.index(cfg,f.signal.signal);expect(f.embed).not.toHaveBeenCalled()})

it('does not reuse a MIME-identified PDF derivative after changing PDF OCR policy',async()=>{const f=fixture();f.sources.clear();f.sources.set('document','PDF source');f.port.list=async()=>[{path:'document',mime:'application/pdf'}];const extract=vi.fn(f.port.extract);f.port.extract=extract;await f.engine.index({...f.settings,ocr:true},f.signal.signal);extract.mockClear();await f.engine.index({...f.settings,ocr:true,pdfOcrMode:'all'},f.signal.signal);expect(extract).toHaveBeenCalledTimes(1)})
