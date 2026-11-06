import 'fake-indexeddb/auto'
import { describe,expect,it } from 'vitest'
import { VaultDatabase } from './database'
import { VaultKeys } from './keys'
import type { AssetHeader } from './chunk-store'
const header=(id:string,createdAt:number,scope='public',status:'writing'|'ready'='ready'):AssetHeader=>({version:1,id,alias:'alias-'+id,scope,createdAt,bytes:1,chunks:1,status,key:{iv:'',data:''},info:{iv:'',data:''}})
describe('encrypted asset metadata pagination',()=>{
 it('uses one durable public key when two app windows initialize storage concurrently',async()=>{const db=new VaultDatabase('key-race-'+crypto.randomUUID()),envelopes=new Map<string,string>();let calls=0,release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve});const device={capabilities:async()=>({encryption:true,biometric:false,name:'Test device'}),protect:async(value:string)=>{const id=crypto.randomUUID();envelopes.set(id,value);if(++calls===2)release();await barrier;return id},unprotect:async(id:string)=>envelopes.get(id)!};const first=new VaultKeys(db,device),second=new VaultKeys(db,device);const keys=await Promise.all([first.key('public'),second.key('public')]);expect(new Uint8Array(await crypto.subtle.exportKey('raw',keys[0]))).toEqual(new Uint8Array(await crypto.subtle.exportKey('raw',keys[1])));const saved=await db.getSetting('scope:public');expect(await db.setSettingIfUnchanged('scope:public',null,{replaced:true})).toBe(false);expect(await db.getSetting('scope:public')).toEqual(saved)})
 it('keeps unfinished writes out of aliases and pages and isolates scope queries',async()=>{
  const db=new VaultDatabase('test-vault-'+crypto.randomUUID());await db.put(header('a',1));await db.put(header('b',2,'project'));await db.put(header('c',3,'public','writing'))
  expect(await db.byAlias('alias-c')).toBeNull();expect((await db.page('public',0,20)).items.map(item=>item.id)).toEqual(['a'])
  const all=[];for await(const item of db.all())all.push(item.id);expect(all.sort()).toEqual(['a','b','c'])
  await db.put(header('c',3));expect((await db.page(undefined,0,1)).next).toBe(1);expect((await db.page(undefined,1,1)).items[0].id).toBe('b')
  await db.remove('c');expect(await db.byAlias('alias-c')).toBeNull()
 })
})

it('paginates authenticated protected scopes without consuming pages on public files',async()=>{const db=new VaultDatabase('scope-filter-'+crypto.randomUUID());await db.put(header('private-old',1,'app'));for(let n=0;n<30;n++)await db.put(header('public-'+n,n+2));await db.put(header('private-new',50,'app'));await db.put(header('other-project',60,'project:two'));const page=await db.page(undefined,0,1,new Set(['app']));expect(page.items.map(item=>item.id)).toEqual(['private-new']);expect(page.next).toBe(1);expect((await db.page(undefined,page.next!,1,new Set(['app']))).items.map(item=>item.id)).toEqual(['private-old'])})
