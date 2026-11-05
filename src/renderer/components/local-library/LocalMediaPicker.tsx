import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Button, Checkbox, Group, ScrollArea, SegmentedControl, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { ImageInStorage } from '@/components/Image'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { acceptsLocalFile, localLibraryFile, localLibraryPage, type LibraryKind, type LocalLibraryItem } from '@/packages/local-library'
import { ScopeUnlock } from '@/components/security/ScopeUnlock'
import { ProtectedAreaUnlocks } from '@/components/security/ProtectedAreaUnlocks'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { useSyncExternalStore } from 'react'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
export const LocalMediaPicker=NiceModal.create(({accept='',multiple=false}:{accept?:string;multiple?:boolean})=>{
  useTranslation();const modal=useModal();const [kind,setKind]=useState<LibraryKind>('vault');const [items,setItems]=useState<LocalLibraryItem[]>([]);const [next,setNext]=useState<number|null>(null)
  const vault=vaultRuntimeFor(platform);const revision=useSyncExternalStore(vault.keys.subscribe,vault.keys.snapshot,vault.keys.snapshot);const [protection,setProtection]=useState<'public'|'protected'>('public')
  const [selected,setSelected]=useState<string[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  const epoch=useRef(0)
  usePrivacyDismiss(modal,[])
  const load=async(cursor=0)=>{const token=++epoch.current;setBusy(true);setError('');try{const page=await localLibraryPage(kind,cursor,protection);if(token!==epoch.current)return;setItems(rows=>cursor?[...rows,...page.items]:page.items);setNext(page.next)}catch{if(token===epoch.current)setError(ft('Unable to read the local library'))}finally{if(token===epoch.current)setBusy(false)}}
  useEffect(()=>{if(modal.visible){setSelected([]);setItems([]);void load()}return()=>{epoch.current++}},[kind,modal.visible,protection,revision])
  const cancel=()=>{epoch.current++;modal.resolve([]);modal.hide()}
  const confirm=async()=>{const token=++epoch.current;setBusy(true);setError('');try{const files:File[]=[];for(const item of items.filter(item=>selected.includes(item.id))){if(token!==epoch.current)return;const file=await localLibraryFile(item);if(!acceptsLocalFile(file,accept))throw new Error(ft('The selected file format is not supported here'));files.push(file)}if(token!==epoch.current)return;modal.resolve(files);modal.hide()}catch(error){if(token===epoch.current)setError(error instanceof Error?error.message:String(error))}finally{if(token===epoch.current)setBusy(false)}}
  return <AdaptiveModal opened={modal.visible} onClose={cancel} title={ft('Choose from local library')} size="lg"><Stack>
    <Text size="sm" c="dimmed">{ft('Files stay on this device until you submit the chat or generation. Only selected items are loaded into memory.')}</Text>
    <ScrollArea type="auto"><SegmentedControl aria-label={ft('Library content type')} value={kind} onChange={value=>setKind(value as LibraryKind)} data={[{value:'vault',label:ft('Saved media')},{value:'image',label:ft('Image sessions')},{value:'audio',label:ft('Audio')},{value:'video',label:'Video'},{value:'document',label:ft('Saved text')}]}/></ScrollArea>
    {kind==='vault'&&<><SegmentedControl aria-label={ft('Library protection')} value={protection} onChange={value=>setProtection(value as 'public'|'protected')} data={[{value:'public',label:ft('Public library')},{value:'protected',label:ft('Protected library')}]}/>{protection==='protected'&&<ProtectedAreaUnlocks vault={vault}/>}</>}
    {kind==='document'&&<Text size="xs" c="dimmed">{ft('Saved document attachments are available as extracted text. Original PDF or Office files must be selected from the device.')}</Text>}
    {items.map(item=><Group key={item.id} wrap="nowrap">{item.thumbnail&&<div style={{width:52,height:52,flexShrink:0}}><ImageInStorage storageKey={item.thumbnail}/></div>}<Checkbox label={item.name} checked={selected.includes(item.id)} onChange={event=>{const checked=event.currentTarget.checked;setSelected(current=>checked?(multiple?[...current,item.id]:[item.id]):current.filter(id=>id!==item.id))}}/></Group>)}
    {!items.length&&!busy&&<Text size="sm">{ft('No saved content in this category')}</Text>}
    {next!==null&&<Button variant="subtle" loading={busy} onClick={()=>void load(next)}>{ft('Show more')}</Button>}
    {error&&<Alert color="red">{error}</Alert>}
    <Group justify="end"><Button variant="default" onClick={cancel}>{ft('Cancel')}</Button><Button disabled={!selected.length} loading={busy} onClick={()=>void confirm()}>{ft('Use selected content')}</Button></Group>
  </Stack></AdaptiveModal>
})
export async function pickLocalMedia(options:{accept?:string;multiple?:boolean}={}) {return NiceModal.show(LocalMediaPicker,options) as Promise<File[]>}
