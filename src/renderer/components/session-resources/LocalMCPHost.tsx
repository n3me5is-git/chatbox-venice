import { useEffect } from 'react'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
export default function LocalMCPHost(){
  useEffect(()=>{
    const ipc=window.electronAPI;if(platform.type!=='desktop'||!ipc?.onLocalMCPRequest)return
    const requests=new Map<string,AbortController>()
    const stop=()=>{for(const controller of requests.values())controller.abort();requests.clear();void ipc.invoke('local-mcp:control','stop').then(()=>window.dispatchEvent(new Event('local-mcp:state-changed'))).catch(()=>{})}
    const unsubscribe=ipc.onLocalMCPRequest(request=>{
      if(request.operation==='cancel'){requests.get(request.id)?.abort();return}
      const controller=new AbortController();requests.set(request.id,controller)
      void import('@/packages/local-mcp/backend').then(module=>module.handleLocalMCP(request,controller.signal)).then(result=>ipc.invoke('local-mcp:reply',request.id,{result})).catch(error=>ipc.invoke('local-mcp:reply',request.id,{error:String(error?.message||error).slice(0,2000)}).catch(()=>{})).finally(()=>requests.delete(request.id))
    })
    const unlock=vaultRuntimeFor(platform).keys.subscribe(stop)
    window.addEventListener('chatbox:privacy-lock',stop)
    return()=>{unsubscribe();unlock();window.removeEventListener('chatbox:privacy-lock',stop);stop()}
  },[])
  return null
}
