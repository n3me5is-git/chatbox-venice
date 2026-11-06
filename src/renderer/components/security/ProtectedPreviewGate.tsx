import { useEffect,useState,type ReactNode } from 'react'
import { ScopeUnlock } from './ScopeUnlock'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { forkT as ft } from '@/i18n/fork'
/** Preview authorization is local to this mounted creation, separate from keys held by running jobs. */
export function ProtectedPreviewGate({scope,children}:{scope?:string;children:ReactNode}){
 const [authorized,setAuthorized]=useState(false)
 useEffect(()=>{const lock=()=>setAuthorized(false);window.addEventListener('chatbox:privacy-lock',lock);return()=>window.removeEventListener('chatbox:privacy-lock',lock)},[])
 if(!scope)return <>{children}</>
 if(!authorized)return <ScopeUnlock keys={vaultRuntimeFor(platform).keys} scope={scope} title={ft('Unlock protected preview')} onUnlocked={()=>setAuthorized(true)}/>
 return <>{children}</>
}
