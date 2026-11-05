import { Alert,Box,Button,Group,Stack,Text } from '@mantine/core'
import { createContext,type ReactNode,useContext,useEffect,useState,useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { ScopeUnlock,useScopeStatus } from './ScopeUnlock'
import { AppTitleBar } from '@/components/layout/AppTitleBar'
import { dismissPrivateSurfaces } from './usePrivacyDismiss'
const AppLockContext=createContext(false)
let locking=false,pendingLock:Promise<void>|undefined
const lockListeners=new Set<()=>void>()
const subscribeLock=(listener:()=>void)=>{lockListeners.add(listener);return()=>{lockListeners.delete(listener)}}
const lockSnapshot=()=>locking
const notifyLock=()=>{for(const listener of lockListeners)listener()}
export function AppLockButton(){const enabled=useContext(AppLockContext);useTranslation();return enabled?<Group justify="end" px="sm"><Button size="compact-xs" variant="subtle" onClick={()=>void lockApplication()}>{ft('Lock app')}</Button></Group>:null}
export function lockApplication():Promise<void>{
  if(pendingLock)return pendingLock
  const vault=vaultRuntimeFor(platform);locking=true;notifyLock();dismissPrivateSurfaces()
  pendingLock=(async()=>{try{
  const [{rendererApplication},{veniceMediaService},{sessionApprovals},{stopAllMessageGenerations},{getImageGenerationService},{uiStore}]=await Promise.all([import('@/app/renderer-application'),import('@/packages/venice/service'),import('@/packages/venice/session-approvals'),import('@/stores/session/generation-cancellation'),import('@/stores/imageGenerationActions'),import('@/stores/uiStore')])
  uiStore.getState().setPictureShow(null);uiStore.getState().setOpenSearchDialog(false)
  sessionApprovals.clearAll()
  await Promise.allSettled([getImageGenerationService().cancel(),veniceMediaService.pauseAll(),...rendererApplication.generationRuntime.getGeneratingSessionIds().map(id=>stopAllMessageGenerations(id))])
  await rendererApplication.queryClient.cancelQueries();rendererApplication.queryClient.clear()
  }finally{vault.keys.lock();locking=false;pendingLock=undefined;notifyLock()}})()
  return pendingLock
}
export function AppGate({children}:{children:ReactNode}){
  const closing=useSyncExternalStore(subscribeLock,lockSnapshot,lockSnapshot)
  useTranslation();const vault=vaultRuntimeFor(platform);const {status,revision,error}=useScopeStatus(vault.keys);const [enabled,setEnabled]=useState<boolean|null>(null);const [background,setBackground]=useState(true);const [settingError,setSettingError]=useState('')
  useEffect(()=>{let active=true;Promise.all([vault.db.getSetting<boolean>('app-lock-enabled'),vault.db.getSetting<boolean>('lock-on-background')]).then(([value,background])=>{if(active){setEnabled(value===true);setBackground(background!==false);setSettingError('')}},()=>{if(active)setSettingError(ft('Unable to read protection settings'))});return()=>{active=false}},[vault,revision])
  useEffect(()=>{if(!enabled||!background)return;const hide=()=>{if(document.visibilityState==='hidden')void lockApplication()};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide)},[enabled,background])
  if(settingError||error)return <Box p="lg"><Alert color="red">{settingError||error}</Alert></Box>
  if(enabled===null||enabled&&!status)return <Box p="lg"><Text>{ft('Loading protection settings…')}</Text></Box>
  if(closing||enabled&&!vault.keys.isUnlocked('app'))return <Box className="App relative flex flex-col"><AppTitleBar/><Stack align="center" justify="center" style={{flex:1,minHeight:300}} p="lg"><Box maw={380} w="100%">{closing?<Text>{ft('Locking and stopping active generations…')}</Text>:<ScopeUnlock keys={vault.keys} title={ft('Unlock Chatbox Venice')}/>}</Box></Stack></Box>
  return <AppLockContext.Provider value={enabled}>{children}</AppLockContext.Provider>
}
