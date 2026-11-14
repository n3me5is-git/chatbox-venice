import {expect,it,vi} from 'vitest'
import {SessionRagEngine,type RagEnginePort} from './session-rag-engine'
import {RagSettingsSchema} from './session-rag'
import {hybridRagSearch,bm25Score} from './knowledge-hybrid'
import {mkdir,writeFile} from 'node:fs/promises'
function fixture(sources:Map<string,string>){const db=new Map<string,unknown>(),cfg=RagSettingsSchema.parse({enabled:true,provider:'fixture',model:'embedding'}),embed=vi.fn(async(inputs:any[])=>inputs.map(()=>[1,0])),port:RagEnginePort={list:async()=>[...sources].map(([path,text])=>({path,mime:'text/plain',bytes:text.length})),read:async path=>{const text=sources.get(path);if(text===undefined)throw Error('Missing');return new TextEncoder().encode(text)},get:async path=>db.get(path)||null,put:async(path,value)=>{db.set(path,value)},remove:async path=>{db.delete(path)},extract:async(_source,bytes)=>({text:new TextDecoder().decode(bytes)}),embed,check:async()=>{}};return {db,cfg,embed,port,engine:new SessionRagEngine(port)}}
it('recovers exact identifiers and names without comparing raw lexical and embedding scores',async()=>{
 const f=fixture(new Map([['generic.md','General support and project notes.'],['code.md','The only failing identifier is CUSTOMER_XQ731 and its retry period is 12 seconds.']]))
 await f.engine.index(f.cfg,new AbortController().signal);expect((await f.engine.search('CUSTOMER_XQ731',f.cfg,new AbortController().signal,1)).matches[0].path).toBe('generic.md')
 expect((await hybridRagSearch(f.port,'CUSTOMER_XQ731',f.cfg,new AbortController().signal,1)).matches[0].path).toBe('code.md')
})
it('preserves semantic retrieval when the relevant passage has no exact query terms',async()=>{
 const f=fixture(new Map([['manual.md','Return an item within thirty days to receive your money back.'],['other.md','Bananas grow in warm climates.']]))
 await f.engine.index(f.cfg,new AbortController().signal);expect((await hybridRagSearch(f.port,'refund policy',f.cfg,new AbortController().signal,1)).matches[0].path).toBe('manual.md')
})
it('supports lexical-only lookup without embedding requests and excludes modified/deleted sources',async()=>{
 const sources=new Map([['a.md','Ticket ZX914 requires escalation.'],['b.md','Nothing to report.']]),f=fixture(sources);await f.engine.index(f.cfg,new AbortController().signal);f.embed.mockClear()
 expect((await hybridRagSearch(f.port,'ZX914',f.cfg,new AbortController().signal,20,true)).matches[0].path).toBe('a.md');expect(f.embed).not.toHaveBeenCalled();sources.set('a.md','Ticket changed.');expect((await hybridRagSearch(f.port,'ZX914',f.cfg,new AbortController().signal,20,true)).matches).toHaveLength(0)
})
it('uses positive BM25 scores with length normalization and exact document frequencies',()=>{
 expect(bm25Score([2],[1],100,20,20)).toBeGreaterThan(bm25Score([2],[90],100,20,20));expect(bm25Score([1],[1],100,10,20)).toBeGreaterThan(bm25Score([1],[1],100,200,20))
})
it('records a controlled retrieval-quality baseline for identifiers, Unicode names and conflicting revisions',async()=>{
 const sources=new Map<string,string>(Array.from({length:20},(_,n)=>['noise-'+n+'.md','General notes unrelated to the requested identifier.']))
 const cases=[['客户_42','Il cliente 客户_42 ha progetto Aurora.'],['INV_2026_017','Invoice INV_2026_017 is paid.'],['retry_timeout_ms','Set retry_timeout_ms to 5000 in the parser.'],['ZX914','Ticket ZX914 requires human escalation.'],['Müller','Customer Müller owns the Vega project.'],['ATP_91','Il vecchio piano ATP_91 prevedeva 15 giorni; quello nuovo prevede 30 giorni.']]
 cases.forEach(([term,text],n)=>sources.set('gold-'+n+'.md',text));const f=fixture(sources);await f.engine.index(f.cfg,new AbortController().signal);let semanticHits=0,hybridHits=0
 for(const [n,[query]] of cases.entries()){const a=await f.engine.search(query,f.cfg,new AbortController().signal,1),b=await hybridRagSearch(f.port,query,f.cfg,new AbortController().signal,1);if(a.matches[0]?.path==='gold-'+n+'.md')semanticHits++;if(b.matches[0]?.path==='gold-'+n+'.md')hybridHits++}
 expect(hybridHits).toBe(cases.length);expect(hybridHits).toBeGreaterThan(semanticHits)
 const report={cases:cases.length,semanticRecallAt1:semanticHits/cases.length,hybridRecallAt1:hybridHits/cases.length,scope:'controlled adversarial identifier fixture with equal embedding scores; tests lexical recovery, not production model quality'};await mkdir('test-results/knowledge-benchmarks',{recursive:true});await writeFile('test-results/knowledge-benchmarks/retrieval-quality.json',JSON.stringify(report,null,2));process.stdout.write('KNOWLEDGE_RETRIEVAL_QUALITY '+JSON.stringify(report)+'\n')
})
