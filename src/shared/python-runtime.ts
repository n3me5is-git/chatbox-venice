/** Pinned official Pyodide release. Assets are optional downloads, never app dependencies. */
export const PYTHON_RUNTIME_VERSION='314.0.7'
export const PYTHON_RUNTIME_ORIGIN='https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'
export const PYTHON_CORE_ASSETS:Record<string,{bytes:number;sha256:string}>={
  'pyodide.mjs':{bytes:17931,sha256:'6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109'},
  'pyodide.asm.mjs':{bytes:1250344,sha256:'f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635'},
  'pyodide.asm.wasm':{bytes:9598218,sha256:'cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6'},
  'python_stdlib.zip':{bytes:2545637,sha256:'fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a'},
  'pyodide-lock.json':{bytes:119077,sha256:'5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010'},
}
export type PythonPackage={name:string;version:string;file_name:string;sha256:string;depends:string[];imports?:string[];package_type?:string}
export interface PythonLock {packages:Record<string,PythonPackage>;info:{python:string}}
export function pythonPackagePlan(lock:PythonLock,names:string[]){
  const plan=new Map<string,PythonPackage>(),visiting=new Set<string>()
  function add(name:string){
    if(plan.has(name))return
    if(visiting.has(name))throw new Error('Invalid Python package dependency cycle')
    const item=lock.packages[name]
    if(!item||!/^[a-zA-Z0-9_.+-]+\.(?:whl|zip)$/.test(item.file_name)||!/^[a-f0-9]{64}$/.test(item.sha256))throw new Error('Unsupported Python package')
    visiting.add(name);for(const dependency of item.depends??[])add(dependency);visiting.delete(name);plan.set(name,item)
    if(plan.size>64)throw new Error('Too many Python package dependencies')
  }
  if(names.length>16)throw new Error('Too many Python packages selected')
  for(const name of names)add(name)
  return [...plan.values()]
}
export async function verifyPythonAsset(bytes:Uint8Array,expected:{sha256:string;bytes?:number}){
  if(expected.bytes!==undefined&&bytes.length!==expected.bytes)throw new Error('Python runtime asset size mismatch')
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes))),byte=>byte.toString(16).padStart(2,'0')).join('')
  if(hash!==expected.sha256)throw new Error('Python runtime asset verification failed')
}
