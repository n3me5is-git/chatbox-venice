import { afterEach,expect,it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LinkedFolderBroker } from './linked-folder'
const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0)){expect(path.dirname(root)).toBe(tmpdir());expect(path.basename(root)).toMatch(/^chatbox-linked-/);await rm(root,{recursive:true,force:true})}})
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'chatbox-linked-'));roots.push(root);await writeFile(path.join(root,'input.md'),'Original');const bindings={};const broker=new LinkedFolderBroker(bindings,()=>{},async()=>root);await broker.operation({sessionId:'root',action:'pick'});return {root,broker}}
it('uses a real directory with binary reads, CAS writes and explicit deletion',async()=>{
 const {root,broker}=await fixture(),listed=await broker.operation({sessionId:'root',action:'list'}),version=listed.files![0].version
 await broker.operation({sessionId:'root',action:'write',path:'input.md',base64:Buffer.from('New').toString('base64'),expectedVersion:version})
 expect(await readFile(path.join(root,'input.md'),'utf8')).toBe('New')
 await expect(broker.operation({sessionId:'root',action:'write',path:'input.md',base64:'',expectedVersion:version})).rejects.toThrow('changed')
 const read=await broker.operation({sessionId:'root',action:'read',path:'input.md'});expect(Buffer.from(read.base64!,'base64').toString()).toBe('New')
 await broker.operation({sessionId:'root',action:'remove',path:'input.md',expectedVersion:read.version});expect((await broker.operation({sessionId:'root',action:'list'})).files).toHaveLength(0)
})
it('isolates dedicated child directories, blocks parent traversal and revokes descendants on unlink',async()=>{
 const {root,broker}=await fixture();await broker.operation({sessionId:'child',parentId:'root',action:'inherit'});await broker.operation({sessionId:'child',action:'write',path:'private.md',base64:Buffer.from('Worker file').toString('base64'),expectedVersion:null})
 expect((await broker.operation({sessionId:'root',action:'list'})).files!.map(file=>file.path)).toEqual(['input.md'])
 await expect(broker.operation({sessionId:'root',action:'read',path:'.chatbox/agents/child/private.md'})).rejects.toThrow('Reserved')
 await expect(broker.operation({sessionId:'child',action:'read',path:'../../input.md'})).rejects.toThrow()
 await broker.operation({sessionId:'root',action:'unlink'});await expect(broker.operation({sessionId:'child',action:'read',path:'private.md'})).rejects.toThrow('expired');expect(await readFile(path.join(root,'input.md'),'utf8')).toBe('Original')
})
it('rejects symlink escapes and stale binding identities',async()=>{
 const {root,broker}=await fixture();const status=await broker.operation({sessionId:'root',action:'status'});const outside=await mkdtemp(path.join(tmpdir(),'chatbox-linked-'));roots.push(outside);await writeFile(path.join(outside,'secret.txt'),'Private');await symlink(outside,path.join(root,'escape'),'junction')
 await expect(broker.operation({sessionId:'root',action:'read',path:'escape/secret.txt'})).rejects.toThrow('Symbolic')
 await broker.operation({sessionId:'root',action:'pick'});await expect(broker.operation({sessionId:'root',action:'read',path:'input.md',bindingId:status.bindingId})).rejects.toThrow('changed')
})

it('reports oversize files without reading them into memory',async()=>{
 const {root,broker}=await fixture();await writeFile(path.join(root,'large.pdf'),'');await truncate(path.join(root,'large.pdf'),11*1024*1024);const listing=await broker.operation({sessionId:'root',action:'list'});expect(listing.skipped).toEqual(['large.pdf']);expect(listing.files!.map(file=>file.path)).toEqual(['input.md'])
})
