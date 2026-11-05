import { Alert,Box,Button,Group,Stack,Text } from '@mantine/core'
import { type ReactNode,useEffect,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { ScopeUnlock,useScopeStatus } from './ScopeUnlock'
export async function lockApplication(){
  const vault=vaultRuntimeFor(platform);vault.keys.lock()
  const [{rendererApplication},{veniceMediaService},{sessionApprovals},{stopAllMessageGenerations},{cancelGeneration}]=await Promise.all([import('@/app/renderer-application'),import('@/packages/venice/service'),import('@/packages/venice/session-approvals'),import('@/stores/session/generation-cancellation'),import('@/stores/imageGenerationActions')])
  cancelGeneration()
  veniceMediaService.pauseAll();sessionApprovals.clearAll();void rendererApplication.queryClient.cancelQueries();rendererApplication.queryClient.clear()
  await Promise.allSettled(rendererApplication.generationRuntime.getGeneratingSessionIds().map(id=>stopAllMessageGenerations(id)))
}
export function AppGate({children}:{children:ReactNode}){
  useTranslation();const vault=vaultRuntimeFor(platform);const {status,revision,error}=useScopeStatus(vault.keys);const [enabled,setEnabled]=useState<boolean|null>(null);const [background,setBackground]=useState(true);const [settingError,setSettingError]=useState('')
  useEffect(()=>{let active=true;Promise.all([vault.db.getSetting<boolean>('app-lock-enabled'),vault.db.getSetting<boolean>('lock-on-background')]).then(([value,background])=>{if(active){setEnabled(value===true);setBackground(background!==false);setSettingError('')}},()=>{if(active)setSettingError(ft('Unable to read protection settings'))});return()=>{active=false}},[vault,revision])
  useEffect(()=>{if(!enabled||!background)return;const hide=()=>{if(document.visibilityState==='hidden')void lockApplication()};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide)},[enabled,background])
  if(settingError||error)return <Box p="lg"><Alert color="red">{settingError||error}</Alert></Box>
  if(enabled===null||enabled&&!status)return <Box p="lg"><Text>{ft('Loading protection settings…')}</Text></Box>
  if(enabled&&!vault.keys.isUnlocked('app'))return <Stack align="center" justify="center" style={{flex:1,minHeight:300}} p="lg"><Box maw={380} w="100%"><ScopeUnlock keys={vault.keys} title={ft('Unlock Chatbox Venice')}/></Box></Stack>
  return <>{enabled&&<Group justify="end" px="sm"><Button size="compact-xs" variant="subtle" onClick={()=>void lockApplication()}>{ft('Lock app')}</Button></Group>}{children}</>
}
