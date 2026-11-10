import {afterEach,expect,it,vi} from 'vitest'
import {promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
vi.mock('electron',()=>({app:{},dialog:{},ipcMain:{}}))
import {DesktopArchiveRoots} from './archive-storage'
const fixtures:string[]=[]
afterEach(async()=>{for(const root of fixtures.splice(0))await fs.rm(root,{recursive:true,force:true})})
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'chatbox-archive-test-'));fixtures.push(root);const profile=path.join(root,'profile'),parent=path.join(root,'disk');await fs.mkdir(parent);return {root,profile,parent,roots:new DesktopArchiveRoots(profile)}}
const name='a1-00000000-0000-4000-8000-000000000001-0.bin'
it('creates only its own directory and survives a native backend restart',async()=>{const f=await fixture();await fs.writeFile(path.join(f.parent,'unrelated.txt'),'keep');const picked=await f.roots.pick(f.parent);await f.roots.operation(picked.id,'write',name,'ciphertext');const reopened=new DesktopArchiveRoots(f.profile);expect(await reopened.operation(picked.id,'read',name)).toBe('ciphertext');await reopened.operation(picked.id,'remove',name);expect(await reopened.operation(picked.id,'read',name)).toBeNull();expect(await fs.readFile(path.join(f.parent,'unrelated.txt'),'utf8')).toBe('keep')})
it('rejects path traversal, overwrites, foreign archives and altered identities',async()=>{const f=await fixture(),picked=await f.roots.pick(f.parent);await expect(f.roots.operation(picked.id,'write','../secret','x')).rejects.toThrow();await f.roots.operation(picked.id,'write',name,'x');await expect(f.roots.operation(picked.id,'write',name,'y')).rejects.toThrow();await fs.writeFile(path.join(picked.name,'archive-id'),'different');expect((await f.roots.status(picked.id)).available).toBe(false);await expect(f.roots.pick(f.parent,picked.id)).rejects.toThrow()})
it('detects disconnected storage and reconnects the original archive under another parent',async()=>{const f=await fixture(),picked=await f.roots.pick(f.parent);await f.roots.operation(picked.id,'write',name,'saved');const next=path.join(f.root,'reattached');await fs.rename(f.parent,next);expect((await f.roots.status(picked.id)).available).toBe(false);await f.roots.pick(next,picked.id);expect(await f.roots.operation(picked.id,'read',name)).toBe('saved')})
it('rejects symlink substitution for archive files',async()=>{const f=await fixture(),picked=await f.roots.pick(f.parent),outside=path.join(f.root,'outside');await fs.writeFile(outside,'secret');await fs.symlink(outside,path.join(picked.name,name));await expect(f.roots.operation(picked.id,'read',name)).rejects.toThrow('Invalid archive file')})
