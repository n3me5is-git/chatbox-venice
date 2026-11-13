import {expect,it,vi} from 'vitest'
import {mkdir,writeFile} from 'node:fs/promises'
import {KnowledgeAugmentationSchema,knowledgeWindows,fuseKnowledgeRanks} from './knowledge-augmentation'
import {KnowledgeAugmentationEngine,type KnowledgeDocument} from './knowledge-augmentation-engine'
import {ragHash} from './session-rag-engine'
const settings=KnowledgeAugmentationSchema.parse({enabled:true,model:{provider:'private',model:'small'}})
async function doc(fileId:string,text:string):Promise<KnowledgeDocument>{return {fileId,text,sourceHash:await ragHash(new TextEncoder().encode(text))}}
function fixture(){const data=new Map<string,unknown>(),revisions=new Map<string,string>(),get=vi.fn(async(key:string)=>data.get(key)??null),extract=vi.fn(async(text:string)=>({summary:'Project source summary',entities:[{name:'Acme',type:'client',quote:text},{name:'Apollo',type:'project',quote:text}],relations:[{subject:'Apollo',predicate:'HAS_CLIENT',object:'Acme',quote:text}],tags:[{key:'domain',value:'business',quote:text}]})),port={get:async<T>(key:string):Promise<T|null>=>await get(key) as T|null,put:async(key:string,value:unknown)=>{data.set(key,value)},remove:async(key:string)=>{data.delete(key)},check:async()=>{},revision:async(id:string)=>revisions.get(id)||null,extract};return {data,revisions,get,extract,port,engine:new KnowledgeAugmentationEngine(port)}}
it('extracts open-schema relations with exact provenance and caches unchanged revisions',async()=>{
 const f=fixture(),source=await doc('one','Apollo has client Acme.');f.revisions.set('one',source.sourceHash)
 const first=await f.engine.index([source],settings,new AbortController().signal);await f.engine.index([source],settings,new AbortController().signal);expect(f.extract).toHaveBeenCalledOnce()
 const result=await f.engine.query({type:'client'},new AbortController().signal);expect(result.results[0].entities.map(entity=>entity.name)).toEqual(['Acme']);expect(result.results[0].relations[0].anchor).toEqual({start:0,end:source.text.length,quote:source.text});expect(first.files[0].sourceHash).toBe(source.sourceHash)
})
it('invalidates only a modified document and removes graph records belonging to deleted documents',async()=>{
 const f=fixture(),a=await doc('a','Apollo has client Acme.'),b=await doc('b','Acme is a client of Apollo.')
 await f.engine.index([a,b],settings,new AbortController().signal);f.extract.mockClear();const changed=await doc('a','Apollo has Acme as its only client.')
 const next=await f.engine.index([changed,b],settings,new AbortController().signal);expect(f.extract).toHaveBeenCalledOnce();const removed=next.files.find(file=>file.fileId==='b')!.alias
 await f.engine.index([changed],settings,new AbortController().signal);expect(f.data.has(removed)).toBe(false)
})
it('refuses invented quotes/relations and preserves the previous committed generation',async()=>{
 const f=fixture(),a=await doc('a','Apollo has client Acme.');await f.engine.index([a],settings,new AbortController().signal);const before=f.data.get('.chatbox/knowledge/index.json')
 f.extract.mockResolvedValue({summary:'invented',entities:[{name:'Acme',type:'client',quote:'THIS DOES NOT EXIST'}],relations:[],tags:[]})
 await expect(f.engine.index([await doc('a','Apollo still has client Acme.')],settings,new AbortController().signal)).rejects.toThrow('absent');expect(f.data.get('.chatbox/knowledge/index.json')).toBe(before)
})
it('excludes changed source revisions at query time and checks protection after the last awaited read',async()=>{
 const f=fixture(),a=await doc('a','Apollo has client Acme.');f.revisions.set('a',a.sourceHash);await f.engine.index([a],settings,new AbortController().signal);f.revisions.set('a','changed')
 expect(await f.engine.query({},new AbortController().signal)).toMatchObject({results:[],stale:['a']})
 let checks=0;f.port.check=async()=>{if(++checks===3)throw Error('Locked')};f.revisions.set('a',a.sourceHash)
 await expect(f.engine.query({},new AbortController().signal)).rejects.toThrow('Locked')
})
it('cancels without publishing partial metadata or leaking uncommitted aliases',async()=>{
 const f=fixture(),controller=new AbortController();f.extract.mockImplementation(async text=>{controller.abort();return {summary:'',entities:[],relations:[],tags:[]}})
 await expect(f.engine.index([await doc('a','Apollo has client Acme.')],settings,controller.signal)).rejects.toThrow();expect(f.data.size).toBe(0)
})
it('covers the entire parsed text in bounded windows, preserves surrogate pairs, and refuses silent truncation',()=>{
 const text='start\n'+'a'.repeat(1993)+'😀'+'b'.repeat(4200),windows=knowledgeWindows(text,2000)
 expect(windows.map(window=>window.text).join('')).toBe(text);expect(windows.every(window=>window.text.length<=2000&&!/[\uD800-\uDBFF]$/.test(window.text))).toBe(true)
 expect(()=>knowledgeWindows('x'.repeat(130000),2000)).toThrow('window limit')
})
it('fuses independent collection ranks without comparing their raw scores or double-counting duplicates',()=>{
 expect(fuseKnowledgeRanks([[{id:'a'},{id:'b'},{id:'a'}],[{id:'b'},{id:'c'}]]).map(item=>item.id)).toEqual(['b','a','c'])
})
it('measures a 2,000-document synthetic corpus with bounded query I/O and zero unchanged model work',async()=>{
 const f=fixture(),sources:KnowledgeDocument[]=[];for(let n=0;n<2000;n++){const source=await doc(String(n),'Apollo has client Acme. Record '+n);sources.push(source);f.revisions.set(source.fileId,source.sourceHash)}
 const started=performance.now();await f.engine.index(sources,settings,new AbortController().signal);const indexedMs=performance.now()-started;f.extract.mockClear();const unchangedStart=performance.now();await f.engine.index(sources,settings,new AbortController().signal);const unchangedMs=performance.now()-unchangedStart;expect(f.extract).not.toHaveBeenCalled()
 f.get.mockClear();const queryStart=performance.now(),result=await f.engine.query({type:'client',limit:20},new AbortController().signal),queryMs=performance.now()-queryStart
 expect(result.results).toHaveLength(20);expect(result.nextOffset).toBe(20);expect(f.get).toHaveBeenCalledTimes(21)
 const report={documents:2000,indexedMs,unchangedMs,queryMs,metadataReads:f.get.mock.calls.length,queryPage:20,unchangedModelCalls:0,maxModelInput:Math.max(...sources.map(source=>source.text.length)),node:process.version,platform:process.platform,provider:'deterministic fixture; in-memory storage; no network or device performance claim'};process.stdout.write('KNOWLEDGE_SYNTHETIC_BENCHMARK '+JSON.stringify(report)+'\n');await mkdir('test-results/knowledge-benchmarks',{recursive:true});await writeFile('test-results/knowledge-benchmarks/synthetic-2000.json',JSON.stringify(report,null,2)+'\n')
},30000)

it('rejects invalid manifest pointers before any deletion or arbitrary storage access',async()=>{
 const f=fixture();f.data.set('.chatbox/knowledge/index.json',{version:1,updated:1,files:[{fileId:'evil',alias:'personal-source',sourceHash:'0'.repeat(64),textHash:'0'.repeat(64),fingerprint:'0'.repeat(64),terms:[]}]});f.data.set('personal-source','keep')
 await expect(f.engine.index([],settings,new AbortController().signal)).rejects.toThrow();expect(f.data.get('personal-source')).toBe('keep')
})

it('retains published records when storage reports an ambiguous error after manifest commit',async()=>{
 const f=fixture(),source=await doc('a','Apollo has client Acme.');f.revisions.set('a',source.sourceHash);const put=f.port.put;f.port.put=async(key,value)=>{await put(key,value);if(key.endsWith('index.json'))throw Error('Ambiguous disk failure')}
 await expect(f.engine.index([source],settings,new AbortController().signal)).rejects.toThrow('Ambiguous')
 const manifest=f.data.get('.chatbox/knowledge/index.json') as {files:{alias:string}[]};expect(f.data.has(manifest.files[0].alias)).toBe(true)
})

it('does not silently resolve same-name entities with conflicting types to one relation endpoint',async()=>{
 const f=fixture();f.extract.mockResolvedValue({summary:'',entities:[{name:'Acme',type:'client',quote:'Apollo has client Acme.'},{name:'Acme',type:'company',quote:'Apollo has client Acme.'},{name:'Apollo',type:'project',quote:'Apollo has client Acme.'}],relations:[{subject:'Apollo',predicate:'HAS_CLIENT',object:'Acme',quote:'Apollo has client Acme.'}],tags:[]})
 const source=await doc('a','Apollo has client Acme.');f.revisions.set('a',source.sourceHash);await f.engine.index([source],settings,new AbortController().signal);const result=await f.engine.query({},new AbortController().signal);expect(result.results[0].relations).toEqual([]);expect(result.results[0].omittedRelations).toBe(1)
})

it('paginates document details rather than returning every entity in a long document',async()=>{
 const f=fixture(),text='Apollo has client Acme.\n'.repeat(400),source=await doc('long',text);f.revisions.set('long',source.sourceHash)
 f.extract.mockImplementation(async window=>({summary:'',entities:Array.from({length:32},()=>({name:'Acme',type:'client',quote:window.slice(0,22)})),relations:[],tags:[]}))
 await f.engine.index([source],settings,new AbortController().signal)
 const first=await f.engine.query({fileId:'long'},new AbortController().signal);expect(first.results[0].entities).toHaveLength(10);expect(first.results[0].nextDetailOffset).toBe(10);expect(first.responseBytes).toBeLessThan(256*1024)
 const second=await f.engine.query({fileId:'long',rowOffset:10},new AbortController().signal);expect(second.results[0].entities).toHaveLength(10)
})

it('retains supported relations while explicitly excluding a pronoun-only citation',async()=>{
 const f=fixture(),source=await doc('a','Apollo has client Acme. Its delivery is tomorrow.');f.revisions.set('a',source.sourceHash)
 f.extract.mockResolvedValue({summary:'',entities:[{name:'Apollo',type:'project',quote:'Apollo has client Acme.'},{name:'Acme',type:'client',quote:'Apollo has client Acme.'}],relations:[{subject:'Apollo',predicate:'HAS_CLIENT',object:'Acme',quote:'Apollo has client Acme.'},{subject:'Apollo',predicate:'IS_LINKED_TO',object:'Acme',quote:'Its delivery is tomorrow.'}],tags:[]})
 await f.engine.index([source],settings,new AbortController().signal);const result=await f.engine.query({},new AbortController().signal);expect(result.results[0].relations).toHaveLength(1);expect(result.results[0].omittedRelations).toBe(1)
})

it('reuses unchanged extraction windows and reanchors their exact quotes after an insertion',async()=>{
 const f=fixture(),cfg={...settings,windowChars:2000},text=Array.from({length:3},(_,n)=>'Apollo has client Acme.\n'+String(n).repeat(1500)+'\n').join(''),source=await doc('a',text)
 f.extract.mockImplementation(async window=>({summary:'Project/client evidence',entities:[{name:'Apollo',type:'project',quote:'Apollo has client Acme.'},{name:'Acme',type:'client',quote:'Apollo has client Acme.'}],relations:[{subject:'Apollo',predicate:'HAS_CLIENT',object:'Acme',quote:'Apollo has client Acme.'}],tags:[]}))
 const first=await f.engine.index([source],cfg,new AbortController().signal);expect(first.stats!.extractedWindows).toBe(3);f.extract.mockClear();const changed=await doc('a','NOTE\n'+text);f.revisions.set('a',changed.sourceHash);const next=await f.engine.index([changed],cfg,new AbortController().signal)
 expect(f.extract).toHaveBeenCalledOnce();expect(next.stats).toMatchObject({extractedWindows:1,reusedWindows:2});const record=await f.port.get<any>(next.files[0].alias);expect(record.relations).toHaveLength(3);for(const edge of record.relations)expect(changed.text.slice(edge.anchor.start,edge.anchor.end)).toBe(edge.anchor.quote)
 f.extract.mockClear();const rebound=await f.engine.index([{...changed,sourceHash:'f'.repeat(64)}],cfg,new AbortController().signal);expect(f.extract).not.toHaveBeenCalled();expect(rebound.stats).toMatchObject({extractedWindows:0,reusedWindows:3,reboundDocuments:1});expect((await f.port.get<any>(rebound.files[0].alias)).sourceHash).toBe('f'.repeat(64))
})
