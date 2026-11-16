import {Alert,Stack,Switch} from '@mantine/core'
import {useEffect,useState,useSyncExternalStore} from 'react'
import type {VaultRuntime} from '@/packages/vault/runtime'
import {INDEXING_BACKGROUND,indexingBackgroundSnapshot,indexingBackgroundStatus,subscribeIndexingBackground,syncIndexingBackground} from '@/packages/knowledge-collections/background'
import {forkT as ft} from '@/i18n/fork'

export function IndexingBackgroundSettings({vault}:{vault:VaultRuntime}){
 const [enabled,setEnabled]=useState(true),[error,setError]=useState('')
 useSyncExternalStore(subscribeIndexingBackground,indexingBackgroundSnapshot,indexingBackgroundSnapshot)
 useEffect(()=>{let active=true;void vault.db?.getSetting<boolean>(INDEXING_BACKGROUND).then(value=>{if(active)setEnabled(value!==false)}).catch(error=>setError((error as Error).message));return()=>{active=false}},[vault])
 if(!vault.db)return null
 return <details><summary>{ft('Background indexing')}</summary><Stack gap="xs" mt="sm"><Switch label={ft('Continue indexing in the background')} description={ft('Keep indexing when leaving this screen or app. While active, automatic app locking waits; manual locking still stops the work. Android shows a foreground notification.')} checked={enabled} onChange={event=>{const next=event.currentTarget.checked;void vault.db.setSetting(INDEXING_BACKGROUND,next).then(async()=>{setEnabled(next);await syncIndexingBackground()}).catch(error=>setError((error as Error).message))}}/>{(error||indexingBackgroundStatus().error)&&<Alert color="yellow">{error||indexingBackgroundStatus().error}</Alert>}</Stack></details>
}
