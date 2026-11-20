import { useEffect } from 'react'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { redactLocalMCPResult } from '@shared/local-mcp-redaction'
import { settingsStore } from '@/stores/settingsStore'
import { rendererApplication } from '@/app/renderer-application'
import { isApplicationLockPending } from '@/components/security/AppGate'
import { localMCPChanged, restoreMCPProfiles, updateMCPProfiles } from '@/packages/local-mcp/profiles'
export default function LocalMCPHost(){
  useEffect(()=>{
    const ipc=window.electronAPI;if(platform.type!=='desktop'||!ipc?.onLocalMCPRequest)return
    const requests=new Map<string,AbortController>()
    let restoreOnUnlock = true
    let lifecycle = new AbortController()
    const control = (command: string, input?: unknown) => ipc.invoke('local-mcp:control', command, input)
    const cancelWork = () => {
      lifecycle.abort()
      for (const controller of requests.values()) controller.abort()
      requests.clear()
    }
    const suspend = () => {
      if (!isApplicationLockPending()) return
      cancelWork()
      restoreOnUnlock = true
      void control('suspend', true).then(localMCPChanged).catch(() => {})
    }
    const unsubscribe=ipc.onLocalMCPRequest(request=>{
      if(request.operation==='revoke'){void import('@/packages/local-mcp/application').then(module=>module.revokeApplicationMCP(request.grant)).catch(()=>{});void import('@/packages/multi-agent/runtime').then(module=>module.revokeExternalAgents(request.grant.token)).catch(()=>{});return}
      if(request.operation==='cancel'){requests.get(request.id)?.abort();return}
      const controller=new AbortController();requests.set(request.id,controller)
      const reply=(value:unknown)=>ipc.invoke('local-mcp:reply',request.id,redactLocalMCPResult(value,settingsStore.getState().getSettings()))
      void import('@/packages/local-mcp/backend').then(module=>module.handleLocalMCP(request,controller.signal)).then(result=>{controller.signal.throwIfAborted();return reply({result})}).catch(error=>{
        // Redact before truncating: cutting a secret in half would defeat exact-value removal.
        const message=redactLocalMCPResult(String(error?.message||error),settingsStore.getState().getSettings()) as string
        return reply({error:message.slice(0,2000)}).catch(()=>{})
      }).finally(()=>requests.delete(request.id))
    })
    const vault = vaultRuntimeFor(platform)
    const synchronize = () => {
      cancelWork()
      lifecycle = new AbortController()
      const {signal} = lifecycle
      void (async () => {
        const locked = await vault.projects.isApplicationLocked() || isApplicationLockPending()
        signal.throwIfAborted()
        if (locked) {
          restoreOnUnlock = true
          await control('suspend', true)
          return
        }
        // A protection change outside an app unlock still revokes existing grants.
        if (!restoreOnUnlock) await control('suspend', false)
        signal.throwIfAborted()
        await control('resume')
        signal.throwIfAborted()
        await import('@/packages/local-mcp/application').then(module=>module.cleanupInactiveMCPContexts()).catch(()=>{})
        signal.throwIfAborted()
        await restoreMCPProfiles(signal)
        restoreOnUnlock = false
      })().catch(()=>{}).finally(localMCPChanged)
    }
    const removeEvents = rendererApplication.sessionEvents.subscribe(async event => {
      if (event.type !== 'session-will-delete') return
      await updateMCPProfiles(profiles=>profiles.filter(profile=>profile.application||!event.ids.includes(profile.sessionId)))
        .finally(()=>Promise.all(event.ids.map(id=>control('stop-chat', id))))
      localMCPChanged()
    })
    // The app-wide host outlives route changes. Scoped keys are checked by the
    // workspace and collection tools and can change without revoking listeners.
    const unlock=vault.keys.subscribe(scope=>{if(scope===undefined||scope==='app')synchronize()})
    window.addEventListener('chatbox:privacy-lock',suspend)
    synchronize()
    return()=>{unsubscribe();unlock();removeEvents();window.removeEventListener('chatbox:privacy-lock',suspend);cancelWork();void control('suspend',false).catch(()=>{})}
  },[])
  return null
}
