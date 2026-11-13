import {Alert,Button,Checkbox,Group,Stack,Text} from '@mantine/core'
import {useEffect,useState,useSyncExternalStore} from 'react'
import {installedVaultFor} from '@/packages/vault/runtime'
import {useTranslation} from 'react-i18next'
import type {KnowledgeBase} from '@shared/types'
import platform from '@/platform'
import {forkT as ft} from '@/i18n/fork'
export function ChatKnowledgeCollections({value,onChange,limit=7,title='Additional knowledge collections',description='Add up to seven encrypted collections alongside the primary knowledge base in the composer. Each keeps its own embedding model and index. The query is sent to the providers configured for every selected collection; protected collections request owner access when used.'}:{value:number[]|undefined;onChange:(ids:number[]|undefined)=>void;limit?:number;title?:string;description?:string}){
 useTranslation();const keys=installedVaultFor(platform)?.keys,revision=useSyncExternalStore(keys?.subscribe||(()=>()=>{}),keys?.snapshot||(()=>0),()=>0),[saved,setEntries]=useState<{revision:number;values:KnowledgeBase[]}>(),[error,setError]=useState(''),entries=saved?.revision===revision?saved.values:undefined
 useEffect(()=>setError(''),[revision])
 const load=async()=>{try{const entries=await platform.getKnowledgeBaseController().list();if(!keys||keys.snapshot()===revision)setEntries({revision,values:entries.filter(entry=>entry.id<0)});setError('')}catch(error){setError((error as Error).message)}}
 return <Stack gap="xs"><Text fw={500}>{ft(title)}</Text><Text size="xs" c="dimmed">{ft(description)}</Text><Group><Button variant="default" size="xs" onClick={()=>void load()}>{ft('Choose collections')}</Button>{!!value?.length&&<Button variant="subtle" size="xs" onClick={()=>onChange(undefined)}>{ft('Clear selection')}</Button>}</Group>{error&&<Alert color="red">{ft(error)}</Alert>}{entries?.map(entry=><Checkbox key={entry.id} label={entry.name} checked={value?.includes(entry.id)||false} disabled={!value?.includes(entry.id)&&(value?.length||0)>=limit} onChange={event=>{const next=event.currentTarget.checked?[...value||[],entry.id]:(value||[]).filter(id=>id!==entry.id);onChange(next.length?next:undefined)}}/>)}{entries?.length===0&&<Text size="sm" c="dimmed">{ft('No encrypted knowledge collections available')}</Text>}{!entries&&!!value?.length&&<Text size="xs">{value.length} {ft('Collections selected')}</Text>}</Stack>
}
