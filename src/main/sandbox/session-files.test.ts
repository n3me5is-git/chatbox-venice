import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const roots=vi.hoisted(()=>({workspace:'',artifacts:'',tmp:''}))
vi.mock('./manager',()=>({getSessionWorkingDirectory:(id:string)=>id==='one'?roots.workspace:null,getSandboxArtifactsRoot:()=>roots.artifacts,getSandboxTmpRoot:()=>roots.tmp}))
import { sessionDiskFiles } from './session-files'
let root=''
beforeEach(async()=>{root=await mkdtemp(path.join(tmpdir(),'session-files-'));roots.tmp=root;roots.workspace=path.join(root,'one');roots.artifacts=path.join(root,'artifacts');await mkdir(roots.workspace);await mkdir(path.join(roots.artifacts,'one'),{recursive:true})})
afterEach(async()=>{await rm(root,{recursive:true,force:true})})
it('lists metadata and removes one file without touching its sibling',async()=>{
  await writeFile(path.join(roots.workspace,'a.md'),'a');await writeFile(path.join(roots.workspace,'b.md'),'b')
  const list=await sessionDiskFiles({sessionId:'one',action:'list'});expect(list.files).toHaveLength(2);expect(list.files[0]).not.toHaveProperty('base64')
  await sessionDiskFiles({sessionId:'one',action:'remove',path:'workspace/a.md'});expect(await readFile(path.join(roots.workspace,'b.md'),'utf8')).toBe('b')
})
it('rejects traversal, other session identities and symlink escapes',async()=>{
  await writeFile(path.join(root,'outside.txt'),'secret');await symlink(path.join(root,'outside.txt'),path.join(roots.workspace,'link.txt'))
  for(const target of ['workspace/../outside.txt','workspace/link.txt','C:\\outside.txt'])await expect(sessionDiskFiles({sessionId:'one',action:'remove',path:target})).rejects.toThrow()
  await expect(sessionDiskFiles({sessionId:'../one',action:'list'})).rejects.toThrow();expect(await readFile(path.join(root,'outside.txt'),'utf8')).toBe('secret')
})
it('finds durable artifacts after the live workspace is absent and rejects oversized preview reads',async()=>{
  await mkdir(path.join(roots.artifacts,'two'));await writeFile(path.join(roots.artifacts,'two','report.md'),'saved')
  expect((await sessionDiskFiles({sessionId:'two',action:'list'})).files[0].name).toBe('report.md')
  const file=path.join(roots.workspace,'large.txt');await writeFile(file,'');await truncate(file,21*1024*1024)
  await expect(sessionDiskFiles({sessionId:'one',action:'read',path:'workspace/large.txt'})).rejects.toThrow('too large')
})
it('does not grant mutation access to a selected external working directory',async()=>{
  roots.workspace=path.join(root,'external');await mkdir(roots.workspace);await writeFile(path.join(roots.workspace,'keep.txt'),'kept')
  expect((await sessionDiskFiles({sessionId:'one',action:'list'})).files[0].readOnly).toBe(true)
  await expect(sessionDiskFiles({sessionId:'one',action:'remove',path:'workspace/keep.txt'})).rejects.toThrow('read-only')
  await expect(sessionDiskFiles({sessionId:'one',action:'write',path:'workspace/keep.txt',content:'changed'})).rejects.toThrow('read-only')
  expect(await readFile(path.join(roots.workspace,'keep.txt'),'utf8')).toBe('kept')
})
