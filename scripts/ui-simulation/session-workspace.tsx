import { Button } from '@mantine/core'
import { useState } from 'react'
import { SessionResources } from '../../src/renderer/components/session-resources/SessionResources'
import { SessionFileStore } from '../../src/shared/session-file-store'
import type { SessionResourceIndex } from '../../src/shared/session-resources'
import { executeSessionCode } from '../../src/shared/session-workspace-execution'
import { capacitorExecution } from '../../src/renderer/packages/mobile-work-mode/execution-service'
import MobileExecutionHost from '../../src/renderer/packages/mobile-work-mode/MobileExecutionHost'
import PythonExecutionHost from '../../src/renderer/components/session-resources/PythonExecutionHost'
import {sessionPythonExecution} from '../../src/renderer/packages/session-resources/python-execution'
import {pythonRuntimeStatus,installPythonRuntime,clearPythonRuntime} from '../../src/renderer/packages/session-resources/python-cache'
import { AdaptiveModal } from '../../src/renderer/components/common/AdaptiveModal'
import { EncryptedChunkStore } from '../../src/renderer/packages/vault/chunk-store'
import { VaultDatabase } from '../../src/renderer/packages/vault/database'
import { aesKey } from '../../src/renderer/packages/vault/crypto'
const blobs=new Map<string,string>(),db=new VaultDatabase('session-workspace-simulation')
const key=aesKey(crypto.getRandomValues(new Uint8Array(32)))
const assets=new EncryptedChunkStore({get:async key=>blobs.get(key)||null,set:async(key,value)=>{blobs.set(key,value)},remove:async key=>{blobs.delete(key)},keys:async()=>[...blobs.keys()]},db,()=>key)
const indexKey=(id:string)=>'index:'+id
async function read(key:string){const header=await assets.header(key);if(!header)throw Error('Missing file');const bytes=new Uint8Array(header.bytes);let at=0;for await(const chunk of assets.read(key)){bytes.set(chunk,at);at+=chunk.length;chunk.fill(0)}return bytes}
export const workspaceTestStore=new SessionFileStore({assertAccess:async()=>{},loadIndex:async id=>await assets.header(indexKey(id))?JSON.parse(new TextDecoder().decode(await read(indexKey(id)))) as SessionResourceIndex:null,saveIndex:async(id,index)=>{const old=await assets.header(indexKey(id));await assets.put((async function*(){yield new TextEncoder().encode(JSON.stringify(index))})(),{kind:'chat',name:'Index',mime:'application/json'},'public',indexKey(id));if(old)await assets.remove('vault-asset-'+old.id)},read,put:async(_id,key,bytes,file)=>{await assets.put((async function*(){yield bytes.length?bytes:new Uint8Array([0])})(),{kind:'document',name:file.name,mime:file.mime},'public',key)},remove:key=>assets.remove(key)})
const store=workspaceTestStore
const api=workspaceTestAPI
const initial='# Local report\n\n## Formula\n\n$E=mc^2$\n\n## Workflow\n\n```mermaid\ngraph LR\nA[Local file] --> B[Deliverable]\n```\n\n[Open data](../input/data.txt)\n\n![Reference](../images/reference.png)\n'
const script='console.log(typeof fetch, typeof process); await files.writeText("result.md", "# Generated locally\\n\\nVerified output");'
export const workspaceTestAPI={mkdir:(id:string,path:string)=>store.mkdir(id,path),configurePython:(id:string,enabled:boolean)=>store.python(id,enabled),pythonStatus:pythonRuntimeStatus,installPython:(names:string[],signal:AbortSignal,progress:(name:string)=>void)=>installPythonRuntime(names,signal,progress,(input,init)=>fetch('/'+new URL(String(input)).pathname.split('/').pop(),init)),clearPython:clearPythonRuntime,executePython:(id:string,code:string,paths:string[],signal:AbortSignal)=>executeSessionCode(store,sessionPythonExecution,id,code,paths,signal),backup:async()=>{},restore:async()=>0,list:async(id:string)=>({items:await store.list(id),directories:(await store.index(id)).directories||[],truncated:false,options:{toolsEnabled:(await store.index(id)).toolsEnabled!==false,pythonEnabled:!!(await store.index(id)).pythonEnabled}}),read:(id:string,item:any)=>store.read(id,item.path),save:(id:string,item:any,text:string)=>store.write(id,item.path,new TextEncoder().encode(text)).then(()=>{}),remove:(id:string,item:any)=>store.remove(id,item.id),export:async()=>{},subscribe:()=>()=>{},create:(id:string,path:string,bytes:Uint8Array,mime?:string)=>store.write(id,path,bytes,{mime}),deliver:(id:string,item:any)=>store.deliver(id,item.path,!item.deliverable),configure:(id:string,enabled:boolean)=>store.tools(id,enabled),execute:(id:string,code:string,paths:string[],signal:AbortSignal)=>executeSessionCode(store,capacitorExecution,id,code,paths,signal)}
export function SessionWorkspaceSimulation(){
  const [opened,setOpened]=useState(false)
  const open=async()=>{
    for(const [path,text]of Object.entries({'docs/report.md':initial,'input/data.txt':'Local reference data','scripts/report.js':script,'scripts/analysis.py':'import numpy as np\nfrom pathlib import Path\nprint(float(np.mean([2, 4, 6])))\nPath("python-result.md").write_text("# Python result\\n\\nMean: 4.0")'}))await store.write('workspace-simulation',path,new TextEncoder().encode(text))
    await store.write('workspace-simulation','images/reference.png',Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/a3k8AAAAASUVORK5CYII='),c=>c.charCodeAt(0)),{mime:'image/png'})
    ;(window as any).__workspaceCiphertext=()=>[...blobs.values()].join('')
    setOpened(true)
  }
  return <><Button m="sm" onClick={()=>void open()}>Test session workspace</Button><MobileExecutionHost/><PythonExecutionHost/><AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title="Session workspace simulation" size="lg"><div style={{height:'72dvh',minHeight:0}}><SessionResources sessionId="workspace-simulation" api={api}/></div></AdaptiveModal></>
}
