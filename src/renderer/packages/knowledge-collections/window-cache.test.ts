import {expect,it} from 'vitest'
import {knowledgeWindowCache,WindowCacheEntries} from './window-cache'

const value={summary:'Grounded summary',entities:[],relations:[],tags:[]}
function fixture(){const records=new Map<string,unknown>();let locked=false;const storage={get:async<T>(path:string)=>(records.get(path) as T)||null,put:async(path:string,value:unknown)=>{records.set(path,structuredClone(value))},remove:async(path:string)=>{records.delete(path)},check:async()=>{if(locked)throw Error('Locked')},publish:async(work:()=>Promise<void>)=>work()};return {records,storage,lock:()=>{locked=true}}}
it('bounds persistent windows to 64 and removes the evicted data without affecting other files',async()=>{
 const {storage,records}=fixture(),cache=knowledgeWindowCache(storage),key=(n:number)=>n.toString(16).padStart(64,'0');records.set('source.pdf','original')
 for(let n=0;n<65;n++)await cache.put(key(n),value,'file-1')
 expect(await cache.get(key(0))).toBeUndefined();expect(await cache.get(key(64))).toEqual(value);expect(WindowCacheEntries.parse(records.get('.chatbox/knowledge/window-cache.json'))).toHaveLength(64);expect([...records.keys()].filter(path=>path.includes('/data/'))).toHaveLength(64);expect(records.get('source.pdf')).toBe('original')
 expect(await knowledgeWindowCache(storage).get(key(64))).toEqual(value)
})
it('requires collection access even for a cache hit and rejects a mismatched binding',async()=>{
 const {storage,records,lock}=fixture(),cache=knowledgeWindowCache(storage),key='a'.repeat(64);await cache.put(key,value,'file-1');const entry=WindowCacheEntries.parse(records.get('.chatbox/knowledge/window-cache.json'))[0];records.set(entry.alias,{key:'b'.repeat(64),value});await expect(cache.get(key)).rejects.toThrow('binding');lock();await expect(cache.get(key)).rejects.toThrow('Locked')
})
it('preserves a cache record when its manifest committed before an ambiguous write error',async()=>{
 const {storage,records}=fixture(),put=storage.put;storage.put=async(path,value)=>{await put(path,value);if(path.endsWith('window-cache.json'))throw Error('Ambiguous write')};const key='c'.repeat(64);await expect(knowledgeWindowCache(storage).put(key,value,'file-1')).rejects.toThrow('Ambiguous');expect(WindowCacheEntries.parse(records.get('.chatbox/knowledge/window-cache.json'))).toHaveLength(1);expect(await knowledgeWindowCache(storage).get(key)).toEqual(value)
})
