import { Alert,Button,Group,Modal,Stack,Text } from '@mantine/core'
import { useLocation } from '@tanstack/react-router'
import { useEffect,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { archiveRuntimeFor } from '@/packages/archive-storage/runtime'
import { navigateToSettings } from '@/modals/settings-navigation'
export function ArchiveStorageGate(){useTranslation();const runtime=archiveRuntimeFor(platform),location=useLocation(),[missing,setMissing]=useState(false),[migrating,setMigrating]=useState(false),[error,setError]=useState('')
  useEffect(()=>{if(!runtime)return;let live=true;let checking=false
    const check=async()=>{if(checking)return;checking=true;try{const state=await runtime.engine.state(),status=await runtime.disk.status(state.root);if(live){setMissing(!status.available);setMigrating(state.phase==='preparing'||state.phase==='copying');setError('')}}catch(error){if(live)setError(error instanceof Error?error.message:String(error))}finally{checking=false}}
    void check();const off=runtime.subscribe(()=>void check()),timer=setInterval(()=>void check(),3000);return()=>{live=false;off();clearInterval(timer)}
  },[runtime])
  const settings=location.pathname.startsWith('/settings')||!!(location.search as {settings?:string}).settings
  return <Modal opened={!!runtime&&(missing||migrating||!!error)&&!settings} onClose={()=>{}} withCloseButton={false} closeOnClickOutside={false} closeOnEscape={false} title={ft(migrating?'Migrating encrypted archive…':'Archive storage needs attention')} centered><Stack>
    <Text size="sm">{ft(migrating?'Keep the app open until migration finishes.':'Archive storage is unavailable. Reconnect the selected card or folder and restore access.')}</Text>
    {error&&<Alert color="red">{ft(error)}</Alert>}
    <Group><Button onClick={()=>navigateToSettings('/data')}>{ft('Open storage settings')}</Button><Button variant="default" onClick={()=>window.location.reload()} disabled={migrating}>{ft('Retry')}</Button></Group>
  </Stack></Modal>
}
