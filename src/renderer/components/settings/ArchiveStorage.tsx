import { Alert,Button,Group,Loader,NativeSelect,Progress,Stack,Text } from '@mantine/core'
import { useEffect,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { archiveRuntimeFor } from '@/packages/archive-storage/runtime'
import type { ArchiveState } from '@/packages/archive-storage/engine'
import { SettingsSection } from './SettingsLayout'
export function ArchiveStorage(){useTranslation();const runtime=archiveRuntimeFor(platform),[state,setState]=useState<ArchiveState>(),[name,setName]=useState(''),[available,setAvailable]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selection,setSelection]=useState('internal')
  const refresh=async()=>{if(!runtime)return;const state=await runtime.engine.state();setState(state);const status=await runtime.disk.status(state.root);setAvailable(status.available);setName(status.name)}
  useEffect(()=>{if(!runtime)return;void refresh().then(()=>runtime.engine.state()).then(state=>setSelection(state.root==='internal'?'internal':'external')).catch(error=>setError(error.message));return runtime.subscribe(()=>{void refresh().catch(error=>setError(error.message))})},[runtime])
  if(!runtime)return null
  const run=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work();await refresh()}catch(error){setError(error instanceof Error?error.message:String(error));await refresh().catch(()=>{})}finally{setBusy(false)}}
  const change=()=>run(async()=>{let target='internal';if(selection==='external'){const result=await runtime.disk.pick();if(!result)return;target=result.id}await runtime.migrate(target);window.location.reload()})
  return <SettingsSection title={ft('Archive storage')}><Stack gap="sm">
    <Text size="sm">{ft('Conversations, attachments, generated media, knowledge documents and encrypted RAG indexes follow this location. Device keys and lightweight navigation metadata stay in the app profile.')}</Text>
    {!state?<Loader size="sm"/>:<>
      <Text size="sm">{ft('Current location')}: {state.root==='internal'?ft('Internal storage'):platform.type==='mobile'?ft('SD card'):ft('Selected folder')}</Text><Text size="xs" style={{overflowWrap:'anywhere'}} c="dimmed">{state.root==='internal'&&platform.type==='mobile'?ft('App private storage'):name}</Text>
      {!available&&<Alert color="red">{ft('Archive storage is unavailable. Reconnect the selected card or folder and restore access.')}</Alert>}
      <NativeSelect label={ft('Save archive to')} value={selection} disabled={busy||!!state.phase} onChange={event=>setSelection(event.currentTarget.value)} data={[{value:'internal',label:ft('Internal storage')},{value:'external',label:platform.type==='mobile'?ft('SD card'):ft('Choose a folder')}]} />
      <Text size="xs" c="dimmed">{ft('Migration copies encrypted blocks, verifies them, switches location and then removes the old copies. Keep the app open. Removing the card pauses archive access; no empty replacement archive is created.')}</Text>
      <Text size="xs" c="dimmed">{ft('This location is not a portable backup: keep an encrypted backup before uninstalling the app or changing devices. Linked workspace folders and legacy desktop databases are separate.')}</Text>
      <Group wrap="wrap"><Button loading={busy} disabled={!!state.phase||!available||selection===(state.root==='internal'?'internal':'external')} onClick={()=>void change()}>{ft('Migrate archive')}</Button>
        {state.root!=='internal'&&<Button variant="default" disabled={busy||!!state.phase||!available} onClick={()=>void run(async()=>{const result=await runtime.disk.pick();if(result){await runtime.migrate(result.id);window.location.reload()}})}>{ft('Change archive folder')}</Button>}
        {state.root!=='internal'&&<Button variant="default" disabled={busy} onClick={()=>void run(async()=>{await runtime.disk.pick(state.root)})}>{ft('Restore folder access')}</Button>}
        <Button variant="subtle" disabled={busy} onClick={()=>void run(async()=>{await runtime.startup();if((await runtime.engine.state()).phase==='cleanup')await runtime.engine.cleanup();await runtime.engine.ready()})}>{ft('Check storage')}</Button>
      </Group>
      {!!state.phase&&<><Text size="sm">{state.phase==='cleanup'?ft('Archive moved; removing previous copies'):ft('Migrating encrypted archive…')}</Text><Progress value={state.total?100*(state.completed||0)/state.total:0} animated/><Text size="xs">{state.completed||0} / {state.total||0}</Text></>}
    </>}{error&&<Alert color="red">{ft(error)}</Alert>}
  </Stack></SettingsSection>
}
