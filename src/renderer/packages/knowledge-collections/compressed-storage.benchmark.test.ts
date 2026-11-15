import {it,expect} from 'vitest'
import {mkdir,writeFile} from 'node:fs/promises'
import {performance} from 'node:perf_hooks'
import fixture from '../../../../scripts/knowledge-benchmark/fixtures/ocr-clean-text.json'
import {packKnowledgeText,unpackKnowledgeText} from '@shared/knowledge-text-storage'
import {createCollectionDescriptor,createPlainCollectionDescriptor,DirectoryDatabase,type DirectoryPort} from './directory-database'
import {directoryAssets} from './directory-assets'
import {decodeKnowledgeText} from '../../../../scripts/portable-knowledge/reader.mjs'
const encoder=new TextEncoder(),hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('')
it('measures real retained OCR text through encrypted and plain collection envelopes, with exact independent-reader recovery',async()=>{
 const records=await Promise.all(fixture.documents.map(async doc=>({version:1 as const,kind:'ocr' as const,text:doc.text,sourceHash:await hash('synthetic-source:'+doc.name),textHash:await hash(doc.text),fingerprint:'c'.repeat(64)}))),packed=await Promise.all(records.map(packKnowledgeText)),measurements=[]
 for(const encrypted of [false,true])for(const compressed of [false,true]){
  const started=performance.now(),{descriptor,key}=encrypted?await createCollectionDescriptor('Synthetic benchmark passphrase'):createPlainCollectionDescriptor(),files=new Map<string,string>()
  const port:DirectoryPort={read:async path=>files.get(path)??null,list:async path=>[...new Set([...files.keys()].filter(k=>k.startsWith(path+'/')).map(k=>k.slice(path.length+1).split('/')[0]))],create:async(path,value)=>{if(files.has(path))throw Object.assign(Error('exists'),{code:'EEXIST'});files.set(path,value)},remove:async path=>{files.delete(path)},check:async()=>{}}
  const db=new DirectoryDatabase(descriptor,async()=>key,port,true),assets=directoryAssets(db,async()=>key)
  for(let n=0;n<records.length;n++){
   const value=compressed?packed[n]:records[n],bytes=encoder.encode(JSON.stringify(value)),source=(async function*(){yield bytes})();const alias='knowledge-collection:-1:text:'+n
   await assets.put(source,{name:fixture.documents[n].name+'.json',mime:'application/json',kind:'document'},'public',alias)
   const chunks:Uint8Array[]=[];for await(const chunk of assets.read(alias))chunks.push(chunk);const total=chunks.reduce((n,c)=>n+c.length,0),read=new Uint8Array(total);let offset=0;for(const chunk of chunks){read.set(chunk,offset);offset+=chunk.length;chunk.fill(0)}
   try{const stored=JSON.parse(new TextDecoder().decode(read));expect(await unpackKnowledgeText(stored)).toEqual(records[n]);expect(decodeKnowledgeText(stored)).toEqual(records[n])}finally{read.fill(0);bytes.fill(0)}
  }
  measurements.push({encrypted,compressed,logicalDirectoryBytes:encoder.encode(JSON.stringify(descriptor)).length+[...files.values()].reduce((n,v)=>n+encoder.encode(v).length,0),files:files.size,elapsedMs:performance.now()-started})
 }
 for(const encrypted of [false,true]){const original=measurements.find(x=>x.encrypted===encrypted&&!x.compressed)!,stored=measurements.find(x=>x.encrypted===encrypted&&x.compressed)!;expect(stored.logicalDirectoryBytes).toBeLessThan(original.logicalDirectoryBytes*.8)}
 const evidence={version:1,scope:'Four synthetic/technical source text assets, including 12-page paper OCR. Counts serialized collection records and descriptor, including actual asset/record envelopes. Excludes source binaries, vectors, filesystem allocation, central metadata and transport overhead. Not a whole-KB or population benchmark.',documents:fixture.documents.map((d,n)=>({name:d.name,utf8Bytes:encoder.encode(d.text).length,storedVersion:packed[n].version})),measurements};await mkdir('test-results/knowledge-benchmarks',{recursive:true});await writeFile('test-results/knowledge-benchmarks/derived-text-storage.json',JSON.stringify(evidence,null,2))
},30000)
