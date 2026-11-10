import { ArchiveEngine,type ArchiveCatalog,type ArchiveEntry,type ArchiveState } from './engine'
export function archiveFixture(){const entries=new Map<string,ArchiveEntry>(),files=new Map<string,string>(),missing=new Set<string>();let state:ArchiveState={root:'internal'}
  const catalog:ArchiveCatalog={state:async()=>structuredClone(state),setState:async value=>{state=structuredClone(value)},get:async key=>structuredClone(entries.get(key)),put:async entry=>{entries.set(entry.key,structuredClone(entry))},remove:async key=>{entries.delete(key)},entries:async()=>structuredClone([...entries.values()]),publish:async(values,next)=>{for(const entry of values)entries.set(entry.key,structuredClone(entry));state=structuredClone(next)}}
  const disk={check:async(root:string)=>{if(missing.has(root))throw new Error('Missing disk')},read:async(root:string,name:string)=>{await disk.check(root);return files.get(root+'/'+name)??null},write:async(root:string,name:string,value:string)=>{await disk.check(root);files.set(root+'/'+name,value)},remove:async(root:string,name:string)=>{await disk.check(root);files.delete(root+'/'+name)}}
  const protector={protect:async(value:string)=>'wrapped:'+value,unprotect:async(value:string)=>value.slice(8)}
  return {engine:new ArchiveEngine(catalog,disk,protector),catalog,disk,files,missing,protector}
}
