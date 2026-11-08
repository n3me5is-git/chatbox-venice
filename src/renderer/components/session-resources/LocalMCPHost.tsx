import { useEffect } from 'react'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { redactLocalMCPResult } from '@shared/local-mcp-redaction'
import { settingsStore } from '@/stores/settingsStore'
export default function LocalMCPHost(){
  useEffect(()=>{
    const ipc=window.electronAPI;if(platform.type!=='desktop'||!ipc?.onLocalMCPRequest)return
    const requests=new Map<string,AbortController>()
    const stop=()=>{for(const controller of requests.values())controller.abort();requests.clear();void ipc.invoke('local-mcp:control','stop').then(()=>window.dispatchEvent(new Event('local-mcp:state-changed'))).catch(()=>{})}
    const unsubscribe=ipc.onLocalMCPRequest(request=>{
      if(request.operation==='revoke'){void import('@/packages/multi-agent/runtime').then(module=>module.revokeExternalAgents(request.grant.token)).catch(()=>{});return}
      if(request.operation==='cancel'){requests.get(request.id)?.abort();return}
      const controller=new AbortController();requests.set(request.id,controller)
      const reply=(value:unknown)=>ipc.invoke('local-mcp:reply',request.id,redactLocalMCPResult(value,settingsStore.getState().getSettings()))
      void import('@/packages/local-mcp/backend').then(module=>module.handleLocalMCP(request,controller.signal)).then(result=>reply({result})).catch(error=>{
        // Redact before truncating: cutting a secret in half would defeat exact-value removal.
        const message=redactLocalMCPResult(String(error?.message||error),settingsStore.getState().getSettings()) as string
        return reply({error:message.slice(0,2000)}).catch(()=>{})
      }).finally(()=>requests.delete(request.id))
    })
    const unlock=vaultRuntimeFor(platform).keys.subscribe(stop)
    window.addEventListener('chatbox:privacy-lock',stop)
    return()=>{unsubscribe();unlock();window.removeEventListener('chatbox:privacy-lock',stop);stop()}
  },[])
  return null
}
