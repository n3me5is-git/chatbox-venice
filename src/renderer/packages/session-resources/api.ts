import type { SessionResource } from '@shared/session-resources'
const service=()=>import('./service')
const files=()=>import('./files')
/** Lazy host adapters keep the preview component independent of app bootstrap. */
export const sessionResourceAPI={
  list:async(id:string,signal?:AbortSignal)=>(await service()).listSessionResources(id,signal),
  read:async(id:string,item:SessionResource)=>(await service()).readSessionResource(id,item),
  remove:async(id:string,item:SessionResource)=>(await service()).removeSessionResource(id,item),
  save:async(id:string,item:SessionResource,text:string)=>(await service()).saveSessionResource(id,item,text),
  export:async(id:string,item:SessionResource)=>(await service()).exportSessionResource(id,item),
  subscribe:(id:string,change:()=>void,locked:()=>void)=>{
    let active=true,unsubscribe:()=>void=()=>{}
    void service().then(module=>{if(active)unsubscribe=module.subscribeSessionResources(id,change,locked)}).catch(()=>{})
    return()=>{active=false;unsubscribe()}
  },
  configure:async(id:string,enabled:boolean)=>(await files()).sessionFiles.tools(id,enabled),
  configurePython:async(id:string,enabled:boolean)=>(await files()).sessionFiles.python(id,enabled),
  pythonStatus:async()=>(await import('./python-cache')).pythonRuntimeStatus(),
  installPython:async(names:string[],signal:AbortSignal,progress:(name:string)=>void)=>(await import('./python-cache')).installPythonRuntime(names,signal,progress),
  clearPython:async()=>(await import('./python-cache')).clearPythonRuntime(),
  executePython:async(id:string,code:string,paths:string[],signal:AbortSignal)=>{
    const {executeSessionPython}=await import('./python-tools')
    return executeSessionPython(id,code,paths,signal)
  },
  execute:async(id:string,code:string,paths:string[],signal:AbortSignal)=>{
    const {executeSessionCode}=await import('@shared/session-workspace-execution')
    const {capacitorExecution}=await import('@/packages/mobile-work-mode/execution-service')
    return executeSessionCode((await files()).sessionFiles,capacitorExecution,id,code,paths,signal)
  },
  create:async(id:string,path:string,bytes:Uint8Array,mime?:string)=>(await files()).sessionFiles.write(id,path,bytes,{mime}),
  mkdir:async(id:string,path:string)=>(await files()).sessionFiles.mkdir(id,path),
  deliver:async(id:string,item:SessionResource)=>{
    const store=(await files()).sessionFiles
    if(item.origin==='file')return store.deliver(id,item.path,!item.deliverable)
    const {bytes}=await (await service()).readSessionResource(id,item)
    try{return await store.write(id,'deliverables/'+crypto.randomUUID().slice(0,8)+'-'+item.name.replace(/[\\/:*?"<>|%\u0000-\u001f]/g,'_'),bytes,{mime:item.mime,deliverable:true})}finally{bytes.fill(0)}
  },
  backup:async(id:string,password:string,signal:AbortSignal)=>(await import('./backup')).exportSessionWorkspace(id,password,signal),
  restore:async(id:string,file:Blob,password:string,signal:AbortSignal)=>(await import('./backup')).restoreSessionWorkspace(id,file,password,signal),
}
