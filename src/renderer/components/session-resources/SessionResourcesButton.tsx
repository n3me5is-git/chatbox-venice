import { ActionIcon, Loader } from '@mantine/core'
import { IconFolderOpen } from '@tabler/icons-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { forkT as ft } from '@/i18n/fork'
import { uiStore } from '@/stores/uiStore'
const Explorer=lazy(()=>import('./SessionResources').then(module=>({default:module.SessionResources})))
export function SessionResourceContent({sessionId}:{sessionId:string}){return <Suspense fallback={<Loader size="sm"/>}><Explorer sessionId={sessionId}/></Suspense>}
export function SessionResourcesButton({sessionId}:{sessionId:string}){
  useTranslation();const small=useIsSmallScreen(),[open,setOpen]=useState(false)
  return <><ActionIcon size="lg" variant="subtle" title={ft('Files and resources')} aria-label={ft('Files and resources')} onClick={()=>small?setOpen(true):uiStore.getState().openSessionPanel(sessionId,'files')}><IconFolderOpen size={20}/></ActionIcon>
    <AdaptiveModal opened={open} onClose={()=>setOpen(false)} title={ft('Files and resources')} size="xl"><div style={{height:'76dvh',minHeight:0}}>{open&&<SessionResourceContent sessionId={sessionId}/>}</div></AdaptiveModal>
  </>
}
