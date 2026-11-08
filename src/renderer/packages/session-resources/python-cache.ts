import { PYTHON_CORE_ASSETS,PYTHON_RUNTIME_ORIGIN,PYTHON_RUNTIME_VERSION,pythonPackagePlan,verifyPythonAsset,type PythonLock } from '@shared/python-runtime'
const request=<T>(value:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error)})
let opening:Promise<IDBDatabase>|undefined
const db=()=>opening??=new Promise<IDBDatabase>((resolve,reject)=>{
  const open=indexedDB.open('chatbox-optional-python-v1',1)
  open.onupgradeneeded=()=>{open.result.createObjectStore('assets');open.result.createObjectStore('settings')}
  open.onerror=()=>{opening=undefined;reject(open.error)}
  open.onblocked=()=>reject(new Error('Close other app windows to update Python storage'))
  open.onsuccess=()=>{open.result.onversionchange=()=>{open.result.close();opening=undefined};resolve(open.result)}
})
async function read(name:string){return request((await db()).transaction('assets').objectStore('assets').get(PYTHON_RUNTIME_VERSION+'/'+name)) as Promise<Uint8Array|undefined>}
async function write(name:string,bytes:Uint8Array){const tx=(await db()).transaction('assets','readwrite');const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)});tx.objectStore('assets').put(bytes,PYTHON_RUNTIME_VERSION+'/'+name);await done}
async function selected(){return await request((await db()).transaction('settings').objectStore('settings').get('packages')) as string[]|undefined??[]}
async function setSelected(names:string[]){await request((await db()).transaction('settings','readwrite').objectStore('settings').put(names,'packages'))}
async function fetchVerified(name:string,expected:{sha256:string;bytes?:number},signal:AbortSignal,fetcher:typeof fetch){
  let bytes=await read(name)
  if(bytes){try{await verifyPythonAsset(bytes,expected);return bytes}catch{bytes=undefined}}
  const response=await fetcher(PYTHON_RUNTIME_ORIGIN+name,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-cache',redirect:'error',signal})
  if(!response.ok||!response.body)throw new Error('Python runtime download failed')
  const reader=response.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[],maximum=expected.bytes??32*1024*1024;let length=0
  try{while(true){signal.throwIfAborted();const value=await reader.read();if(value.done)break;length+=value.value.length;if(length>maximum)throw new Error('Python runtime download exceeds the size limit');chunks.push(value.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
  await verifyPythonAsset(bytes,expected);signal.throwIfAborted();await write(name,bytes);return bytes
}
export async function pythonRuntimeStatus(){
  let ready=true,bytes=0;for(const name of Object.keys(PYTHON_CORE_ASSETS)){const asset=await read(name);if(!asset)ready=false;else bytes+=asset.length}
  const packages=await selected()
  if(ready){const lock=JSON.parse(new TextDecoder().decode((await read('pyodide-lock.json'))!)) as PythonLock;for(const item of pythonPackagePlan(lock,packages)){const asset=await read(item.file_name);if(!asset)ready=false;else bytes+=asset.length}}
  return {ready,bytes,packages}
}
/** Explicit human action only; execution never calls this downloader. */
export async function installPythonRuntime(names:string[],signal:AbortSignal,progress:(name:string)=>void=()=>{},fetcher:typeof fetch=fetch){
  for(const [name,expected]of Object.entries(PYTHON_CORE_ASSETS)){progress(name);await fetchVerified(name,expected,signal,fetcher)}
  const lock=JSON.parse(new TextDecoder().decode((await read('pyodide-lock.json'))!)) as PythonLock
  const plan=pythonPackagePlan(lock,names);let total=Object.values(PYTHON_CORE_ASSETS).reduce((sum,item)=>sum+item.bytes,0)
  for(const item of plan){progress(item.name);const asset=await fetchVerified(item.file_name,{sha256:item.sha256},signal,fetcher);total+=asset.length;if(total>160*1024*1024)throw new Error('Python runtime storage limit reached')}
  await setSelected(names);await navigator.storage?.persist?.().catch(()=>false)
  return pythonRuntimeStatus()
}
export async function cachedPythonRuntime(){
  const assets:Record<string,Uint8Array>={},names=await selected()
  for(const [name,expected]of Object.entries(PYTHON_CORE_ASSETS)){const bytes=await read(name);if(!bytes)throw new Error('Download the optional Python runtime first');await verifyPythonAsset(bytes,expected);assets[name]=bytes}
  const lock=JSON.parse(new TextDecoder().decode(assets['pyodide-lock.json'])) as PythonLock
  for(const item of pythonPackagePlan(lock,names)){const bytes=await read(item.file_name);if(!bytes)throw new Error('Download the selected Python packages first');await verifyPythonAsset(bytes,{sha256:item.sha256});assets[item.file_name]=bytes}
  return {assets,packages:names,lock}
}
export async function clearPythonRuntime(){
  const tx=(await db()).transaction(['assets','settings'],'readwrite'),done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error)})
  tx.objectStore('assets').clear();tx.objectStore('settings').clear();await done
}
