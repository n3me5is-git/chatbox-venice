import { afterEach,expect,it } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, writeFile, rm, symlink, truncate } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LinkedFolderBroker } from './linked-folder'
const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0)){expect(path.dirname(root)).toBe(tmpdir());expect(path.basename(root)).toMatch(/^chatbox-linked-/);await rm(root,{recursive:true,force:true})}})
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),'chatbox-linked-'));roots.push(root);await writeFile(path.join(root,'input.md'),'Original');const bindings={};const broker=new LinkedFolderBroker(bindings,()=>{},async()=>root);await broker.operation({sessionId:'root',action:'pick'});return {root,broker}}

it('returns only revision-matched originals inside the selected knowledge folder', async () => {
  const { root, broker } = await fixture()
  const relativePath = 'nested/Source #1.md'
  const file = path.join(root, relativePath)
  await mkdir(path.dirname(file))
  await writeFile(file, 'Indexed source')
  const sessionId = 'knowledge-1'
  const { bindingId } = await broker.operation({ sessionId, action: 'pick' })
  const listing = await broker.operation({ sessionId, action: 'list', bindingId })
  const expectedVersion = listing.files!.find(row => row.path === relativePath)!.version
  const request = { sessionId, bindingId, action: 'locate-source' as const, path: relativePath, expectedVersion }
  const { localFile } = await broker.operation(request)
  expect(localFile).toMatchObject({ path: await realpath(file), relativePath })
  expect(localFile!.uri).toContain('Source%20%231.md')
  expect(fileURLToPath(localFile!.uri)).toBe(localFile!.path)
  await expect(broker.operation({ ...request, path: '../secret.md' })).rejects.toThrow()
  await expect(broker.operation({ ...request, path: '.rag-collection/collection.json' })).rejects.toThrow('Reserved')
  await expect(broker.operation({ ...request, sessionId: 'root', bindingId: undefined })).rejects.toThrow('grant')
  await writeFile(file, 'Changed on disk')
  expect((await broker.operation(request)).localFile).toBeUndefined()
  await broker.operation({ sessionId, action: 'pick' })
  await expect(broker.operation(request)).rejects.toThrow('changed')
})
it('scans a 50 MiB knowledge source and reads bounded ranges without enlarging session or database limits',async()=>{
 const {root,broker}=await fixture(),file=path.join(root,'large.pdf');await writeFile(file,'');await truncate(file,50*1024*1024);const grant=await broker.operation({sessionId:'knowledge-1',action:'pick'}),listed=await broker.operation({sessionId:'knowledge-1',action:'list',bindingId:grant.bindingId});expect(listed.files!.find(row=>row.path==='large.pdf')?.bytes).toBe(50*1024*1024);expect((await broker.operation({sessionId:'root',action:'list'})).skipped).toContain('large.pdf');const chunk=await broker.operation({sessionId:'knowledge-1',action:'read-chunk',bindingId:grant.bindingId,path:'large.pdf',offset:49*1024*1024,length:1024*1024});expect(chunk.totalBytes).toBe(50*1024*1024);expect(Buffer.from(chunk.base64!,'base64').length).toBe(1024*1024);await expect(broker.operation({sessionId:'knowledge-1',action:'read-chunk',bindingId:grant.bindingId,path:'large.pdf',offset:0,length:1024*1024+1})).rejects.toThrow('range');await expect(broker.operation({sessionId:'root',action:'read-chunk',path:'large.pdf',offset:0,length:1})).rejects.toThrow('range');await truncate(file,50*1024*1024+1);expect((await broker.operation({sessionId:'knowledge-1',action:'list'})).skipped).toContain('large.pdf')
})
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

it('keeps knowledge roots read-only and refuses writable descendants',async()=>{const {root,broker}=await fixture();await broker.operation({sessionId:'knowledge-1',action:'pick'});expect((await broker.operation({sessionId:'knowledge-1',action:'list'})).files).toHaveLength(1);for(const action of ['write','mkdir','remove'] as const)await expect(broker.operation({sessionId:'knowledge-1',action,path:'input.md',base64:''})).rejects.toThrow('read-only');await expect(broker.operation({sessionId:'child',action:'inherit',parentId:'knowledge-1'})).rejects.toThrow('read-only');expect(await readFile(path.join(root,'input.md'),'utf8')).toBe('Original')})

it('grants database writes only in the reserved collection directory and excludes it from recursive sources',async()=>{const {root,broker}=await fixture();const status=await broker.operation({sessionId:'knowledge-2',action:'pick',database:true}),bindingId=status.bindingId!;await mkdir(path.join(root,'nested'));await writeFile(path.join(root,'nested','source.md'),'Nested source');await broker.operation({sessionId:'knowledge-2',bindingId,action:'database-write',path:'.rag-collection/collection.json',base64:Buffer.from('{}').toString('base64')});expect((await broker.operation({sessionId:'knowledge-2',action:'list'})).files!.map(row=>row.path).sort()).toEqual(['input.md','nested/source.md']);expect((await broker.operation({sessionId:'knowledge-2',bindingId,action:'database-read',path:'.rag-collection/collection.json'})).exists).toBe(true);await expect(broker.operation({sessionId:'knowledge-2',bindingId,action:'database-write',path:'input.md',base64:''})).rejects.toThrow('database path');await expect(broker.operation({sessionId:'knowledge-2',bindingId,action:'database-write',path:'.rag-collection/collection.json',base64:''})).rejects.toThrow('immutable');await expect(broker.operation({sessionId:'knowledge-2',bindingId,action:'write',path:'input.md',base64:''})).rejects.toThrow('read-only');const readonly=await broker.operation({sessionId:'knowledge-3',action:'pick'});await expect(broker.operation({sessionId:'knowledge-3',bindingId:readonly.bindingId,action:'database-write',path:'.rag-collection/collection.json',base64:''})).rejects.toThrow('read-only');expect(await readFile(path.join(root,'input.md'),'utf8')).toBe('Original')})

it('stages and abandons a migration root without revoking the existing recursive source grant',async()=>{const first=await fixture(),other=await mkdtemp(path.join(tmpdir(),'chatbox-linked-'));roots.push(other);let chosen=first.root;const bindings={},broker=new LinkedFolderBroker(bindings,()=>{},async()=>chosen),original=await broker.operation({sessionId:'knowledge-9',action:'pick'});chosen=other;const staged=await broker.operation({sessionId:'knowledge-9',action:'pick',database:true,transactional:true});expect(staged.staged).toBe(true);expect((await broker.operation({sessionId:'knowledge-9',action:'status'})).bindingId).toBe(original.bindingId);expect((await broker.operation({sessionId:'knowledge-9',action:'list',bindingId:original.bindingId})).files!.map(row=>row.path)).toEqual(['input.md']);await broker.operation({sessionId:'knowledge-9',bindingId:staged.bindingId,action:'database-write',path:'.rag-collection/collection.json',base64:Buffer.from('{}').toString('base64')});await broker.operation({sessionId:'knowledge-9',bindingId:staged.bindingId,action:'database-abandon'});expect((await broker.operation({sessionId:'knowledge-9',action:'status'})).bindingId).toBe(original.bindingId);const retry=await broker.operation({sessionId:'knowledge-9',action:'pick',database:true,transactional:true});await broker.operation({sessionId:'knowledge-9',bindingId:retry.bindingId,action:'database-adopt'});expect((await broker.operation({sessionId:'knowledge-9',action:'status'})).bindingId).toBe(retry.bindingId);expect(await readFile(path.join(first.root,'input.md'),'utf8')).toBe('Original');expect(await readFile(path.join(other,'.rag-collection','collection.json'),'utf8')).toBe('{}')})
