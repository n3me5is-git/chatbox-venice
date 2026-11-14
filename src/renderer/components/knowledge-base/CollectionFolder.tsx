import {Alert,Button,Group,Stack,Switch,Text} from '@mantine/core'
import {useEffect,useState} from 'react'
import {useTranslation} from 'react-i18next'
import {forkT as ft} from '@/i18n/fork'
import type {CollectionData} from '@/packages/knowledge-collections/store'
import {automaticCollectionFolder,chooseCollectionFolder,disconnectCollectionFolder,knowledgeFolderAvailable,linkedCollectionError,refreshCollectionFolder} from '@/packages/knowledge-collections/linked-folder'
export function CollectionFolder({id,data,busy,run}:{id:number;data:CollectionData;busy:boolean;run(work:()=>Promise<void>):Promise<void>}){
 useTranslation();const [,refresh]=useState(0);useEffect(()=>{const listener=()=>refresh(value=>value+1);window.addEventListener('knowledge-collections:changed',listener);return()=>window.removeEventListener('knowledge-collections:changed',listener)},[])
 if(!knowledgeFolderAvailable())return null
 const folder=data.folder,error=linkedCollectionError(id)
 return <Stack gap="xs"><Text fw={500}>{ft('Linked source folder')}</Text><Text size="xs" c="dimmed">{ft('Source folders are read-only. Documents are copied into encrypted app storage. Changed hashes update only affected documents; original files are never deleted. Copies remain available when the folder is missing.')}</Text>{folder&&<Text size="sm" style={{overflowWrap:'anywhere'}}>{folder.name}</Text>}{error&&<Alert color="yellow">{ft(error)}</Alert>}<Group wrap="wrap"><Button variant="default" disabled={busy} onClick={()=>void run(()=>chooseCollectionFolder(id))}>{ft(folder?'Choose another source folder':'Link a source folder')}</Button>{folder&&<><Button variant="light" disabled={busy} onClick={()=>void run(async()=>{await refreshCollectionFolder(id,true)})}>{ft('Refresh folder and update index')}</Button><Button variant="subtle" disabled={busy} onClick={()=>void run(()=>disconnectCollectionFolder(id))}>{ft('Disconnect folder and keep copies')}</Button></>}</Group>{folder&&<Switch disabled={busy} checked={folder.automatic} label={ft('Automatically refresh and index while the app is active')} description={ft('Checks every minute. Changed documents may use the saved providers and incur charges. Locked collections pause. After a folder error, refresh manually to resume.')} onChange={event=>{const enabled=event.currentTarget.checked;void run(()=>automaticCollectionFolder(id,enabled))}}/>}</Stack>
}
