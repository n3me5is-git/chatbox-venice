import { Alert,Box,Loader,Stack } from '@mantine/core'
import { type ReactNode,useEffect,useState,useSyncExternalStore } from 'react'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { installedVaultFor } from '@/packages/vault/runtime'
import { ScopeUnlock } from './ScopeUnlock'
const noSubscribe=()=>()=>{}
const zero=()=>0
export function useProjectAccessState({sessionId,folderId}:{sessionId?:string|null;folderId?:string}){
  const vault=installedVaultFor(platform),access=vault?.projects;const revision=useSyncExternalStore(vault?.keys.subscribe||noSubscribe,vault?.keys.snapshot||zero,zero)
  const identity=sessionId?'session:'+sessionId:folderId?'folder:'+folderId:'none'
  const [state,setState]=useState<{identity:string;scope:string|null;error:string}>({identity:'',scope:null,error:''})
  useEffect(()=>{let active=true;if(!access||identity==='none'){setState({identity,scope:null,error:''});return}const work=sessionId?access.sessionScope(sessionId):access.folderScope(folderId);work.then(scope=>{if(active)setState({identity,scope:scope||null,error:''})},()=>{if(active)setState({identity,scope:null,error:ft('Unable to read project protection')})});return()=>{active=false}},[access,identity,revision])
  if(!access||identity==='none')return {ready:true,locked:false,scope:null,error:'',revision}
  const ready=state.identity===identity;return {ready,locked:ready&&!!state.scope&&!vault!.keys.isUnlocked(state.scope),scope:state.scope,error:state.error,revision}
}
export function ProjectGate({children,sessionId,folderId}:{children:ReactNode;sessionId?:string;folderId?:string}){
  const access=useProjectAccessState({sessionId,folderId}),vault=installedVaultFor(platform)
  if(!access.ready)return <Stack align="center" p="xl"><Loader/></Stack>
  if(access.error)return <Box p="lg"><Alert color="red">{access.error}</Alert></Box>
  if(access.locked&&access.scope&&vault)return <Stack align="center" justify="center" h="100%" p="lg"><Box maw={380} w="100%"><ScopeUnlock keys={vault.keys} scope={access.scope} title={ft('Unlock this project')}/></Box></Stack>
  return <>{children}</>
}
