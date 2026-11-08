import { expect,it } from 'vitest'
import { pythonPackagePlan,verifyPythonAsset,type PythonLock } from './python-runtime'
import { buildPythonExecutionHtml,limitPythonMemory } from './python-execution-html'
const packageInfo=(name:string,depends:string[]=[])=>({name,version:'1',file_name:name+'.whl',depends,sha256:'0'.repeat(64)})
it('pins assets by exact length and SHA-256 before execution',async()=>{
  const bytes=new TextEncoder().encode('abc')
  await expect(verifyPythonAsset(bytes,{bytes:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'})).resolves.toBeUndefined()
  await expect(verifyPythonAsset(bytes,{bytes:4,sha256:'0'.repeat(64)})).rejects.toThrow('size')
  await expect(verifyPythonAsset(bytes,{sha256:'0'.repeat(64)})).rejects.toThrow('verification')
})
it('resolves only catalog wheels and rejects URLs, unknown packages and dependency cycles',()=>{
  const lock={packages:{numpy:packageInfo('numpy'),pandas:packageInfo('pandas',['numpy'])}} as unknown as PythonLock
  expect(pythonPackagePlan(lock,['pandas','numpy']).map(item=>item.name)).toEqual(['numpy','pandas'])
  expect(()=>pythonPackagePlan(lock,['unknown'])).toThrow('Unsupported')
  lock.packages.numpy.file_name='https://evil.test/numpy.whl';expect(()=>pythonPackagePlan(lock,['numpy'])).toThrow('Unsupported')
  lock.packages.numpy=packageInfo('numpy',['pandas']);expect(()=>pythonPackagePlan(lock,['pandas'])).toThrow('cycle')
})
it('caps the pinned WASM memory at 256 MiB without changing offsets; blocks all worker network connections',()=>{
  const wasm=new Uint8Array([0,97,115,109,1,0,0,0,5,8,1,1,0xe0,3,0x80,0x80,4,0])
  // The actual memory section body is seven bytes: count,flags,min(2),max(3).
  const valid=wasm.slice(0,-1);valid[9]=7
  expect(WebAssembly.validate(valid)).toBe(true)
  const capped=limitPythonMemory(valid);expect(WebAssembly.validate(capped)).toBe(true);expect(capped.length).toBe(valid.length);expect([...capped.slice(-3)]).toEqual([0x80,0xa0,0])
  expect([...valid.slice(-3)]).toEqual([0x80,0x80,4]);expect(()=>limitPythonMemory(new Uint8Array(8))).toThrow('missing')
  const html=buildPythonExecutionHtml('job','token');expect(html).toContain("connect-src 'none'");expect(html).toContain('worker-src data:');expect(html).not.toContain('allow-same-origin')
})
