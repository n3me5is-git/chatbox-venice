import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {EventEmitter} from 'node:events'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {PADDLE_OCR_MODEL} from '../../shared/paddle-ocr'
import {PaddleOcrWorker} from './worker'
const cleanups:Array<()=>Promise<void>>=[],hash=(value:string)=>createHash('sha256').update(value).digest('hex'),image='data:image/png;base64,AQID'
beforeEach(()=>vi.useFakeTimers({toFake:['setTimeout','clearTimeout']}))
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();vi.useRealTimers()})
async function until(check:()=>boolean|Promise<boolean>){const deadline=Date.now()+3000;while(!await check()){if(Date.now()>deadline)throw Error('OCR fixture timed out');await new Promise<void>(resolve=>setImmediate(resolve))}}
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'paddle-worker-')),directory=join(root,'bundle-'+'a'.repeat(16));await mkdir(directory)
 const names=['paddle-ocr-worker.exe','det.ncnn.param','det.ncnn.bin','rec.ncnn.param','rec.ncnn.bin','dictionary.json'],data='synthetic fixture',manifest=JSON.stringify({version:1,model:PADDLE_OCR_MODEL,files:Object.fromEntries(names.map(name=>[name,{bytes:Buffer.byteLength(data),sha256:hash(data)}]))});for(const name of names)await writeFile(join(directory,name),data);await writeFile(join(directory,'runtime-manifest.json'),manifest)
 const writes:Array<{id:string;image:string}>=[],children:any[]=[],spawn=vi.fn((..._args:any[])=>{
  const stdout=new EventEmitter(),stderr=new EventEmitter(),child=Object.assign(new EventEmitter(),{stdout,stderr,stdin:{write:(raw:string,callback:(error?:Error)=>void)=>{writes.push(JSON.parse(raw));callback()}},exitCode:null as number|null,kill:vi.fn(function(this:any){this.exitCode=0;this.emit('close',0);this.emit('exit',0);return true})});children.push(child);setImmediate(()=>stdout.emit('data',JSON.stringify({ready:true,backend:'cpu',classes:838,device:'CPU'})+'\n'));return child
 })
 const worker=new PaddleOcrWorker(root,{artifact:{name:'test.zip',url:'https://github.com/test/test.zip',bytes:1,sha256:'a'.repeat(64),manifestSha256:hash(manifest)},extract:async()=>{},spawn:spawn as any})
 cleanups.push(async()=>{await worker.unload();await rm(root,{recursive:true,force:true})})
 const answer=(id:string,text:string)=>children.at(-1).stdout.emit('data',JSON.stringify({id,text})+'\n')
 return {worker,spawn,children,writes,answer,directory}
}
it('serializes pages over private stdio, reuses weights and resets the idle timer',async()=>{const f=await fixture();await f.worker.configure({backend:'cpu',threads:2,idleSeconds:10});const first=f.worker.ocr('one',PADDLE_OCR_MODEL,image),second=f.worker.ocr('two',PADDLE_OCR_MODEL,image);await until(()=>f.writes.length===1);expect(f.spawn).toHaveBeenCalledOnce();expect(f.spawn.mock.calls[0][1]).not.toContain('--port');f.answer('one','page one');await expect(first).resolves.toBe('page one');await until(()=>f.writes.length===2);await vi.advanceTimersByTimeAsync(10000);expect(f.children[0].kill).not.toHaveBeenCalled();f.answer('two','page two');await expect(second).resolves.toBe('page two');await vi.advanceTimersByTimeAsync(9999);expect(f.children[0].kill).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(f.children[0].kill).toHaveBeenCalledOnce()})
it('returns queued cancellation immediately without killing the active page',async()=>{const f=await fixture(),first=f.worker.ocr('one',PADDLE_OCR_MODEL,image),second=f.worker.ocr('two',PADDLE_OCR_MODEL,image).catch(e=>e);await until(()=>f.writes.length===1);f.worker.cancel('two');expect(await second).toBeInstanceOf(Error);expect(f.children[0].kill).not.toHaveBeenCalled();f.answer('one','complete');await expect(first).resolves.toBe('complete');await until(async()=>(await f.worker.status()).pending===0);expect(f.writes).toHaveLength(1)})
it('unload cancels active and queued requests before returning',async()=>{const f=await fixture(),first=f.worker.ocr('one',PADDLE_OCR_MODEL,image).catch(e=>e),second=f.worker.ocr('two',PADDLE_OCR_MODEL,image).catch(e=>e);await until(()=>f.writes.length===1);await f.worker.unload();expect(await first).toBeInstanceOf(Error);expect(await second).toBeInstanceOf(Error);expect((await f.worker.status()).pending).toBe(0);expect(f.children[0].kill).toHaveBeenCalledOnce()})
it('verifies actual file hashes before executing and never starts a damaged engine',async()=>{const f=await fixture();await writeFile(join(f.directory,'det.ncnn.bin'),'tampered fixture!');await expect(f.worker.ocr('one',PADDLE_OCR_MODEL,image)).rejects.toThrow('Install and verify');expect(f.spawn).not.toHaveBeenCalled()})
it('rejects unsupported models and external image URLs before spawning',async()=>{const f=await fixture();await expect(f.worker.ocr('one','remote-model',image)).rejects.toThrow('supported');await expect(f.worker.ocr('two',PADDLE_OCR_MODEL,'https://example.test/private.png')).rejects.toThrow();expect(f.spawn).not.toHaveBeenCalled()})
