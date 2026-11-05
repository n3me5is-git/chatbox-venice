import 'fake-indexeddb/auto'
import { describe,expect,it } from 'vitest'
import { VaultDatabase } from './database'
import type { AssetHeader } from './chunk-store'
const header=(id:string,createdAt:number,scope='public',status:'writing'|'ready'='ready'):AssetHeader=>({version:1,id,alias:'alias-'+id,scope,createdAt,bytes:1,chunks:1,status,key:{iv:'',data:''},info:{iv:'',data:''}})
describe('encrypted asset metadata pagination',()=>{
 it('keeps unfinished writes out of aliases and pages and isolates scope queries',async()=>{
  const db=new VaultDatabase('test-vault-'+crypto.randomUUID());await db.put(header('a',1));await db.put(header('b',2,'project'));await db.put(header('c',3,'public','writing'))
  expect(await db.byAlias('alias-c')).toBeNull();expect((await db.page('public',0,20)).items.map(item=>item.id)).toEqual(['a'])
  const all=[];for await(const item of db.all())all.push(item.id);expect(all.sort()).toEqual(['a','b','c'])
  await db.put(header('c',3));expect((await db.page(undefined,0,1)).next).toBe(1);expect((await db.page(undefined,1,1)).items[0].id).toBe('b')
  await db.remove('c');expect(await db.byAlias('alias-c')).toBeNull()
 })
})
