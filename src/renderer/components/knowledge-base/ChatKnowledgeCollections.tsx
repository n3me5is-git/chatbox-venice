import {Alert,Button,Checkbox,Group,Stack,Text} from '@mantine/core'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import type {KnowledgeBase} from '@shared/types'
import platform from '@/platform'
import {forkT as ft} from '@/i18n/fork'
export function ChatKnowledgeCollections({value,onChange}:{value:number[]|undefined;onChange:(ids:number[]|undefined)=>void}){
 useTranslation();const [entries,setEntries]=useState<KnowledgeBase[]>(),[error,setError]=useState('')
 const load=async()=>{try{const entries=await platform.getKnowledgeBaseController().list();setEntries(entries.filter(entry=>entry.id<0));setError('')}catch(error){setError((error as Error).message)}}
 return <Stack gap="xs"><Text fw={500}>{ft('Additional knowledge collections')}</Text><Text size="xs" c="dimmed">{ft('Add up to seven encrypted collections alongside the primary knowledge base in the composer. Each keeps its own embedding model and index. The query is sent to the providers configured for every selected collection; protected collections request owner access when used.')}</Text><Group><Button variant="default" size="xs" onClick={()=>void load()}>{ft('Choose collections')}</Button>{!!value?.length&&<Button variant="subtle" size="xs" onClick={()=>onChange(undefined)}>{ft('Clear selection')}</Button>}</Group>{error&&<Alert color="red">{ft(error)}</Alert>}{entries?.map(entry=><Checkbox key={entry.id} label={entry.name} checked={value?.includes(entry.id)||false} disabled={!value?.includes(entry.id)&&(value?.length||0)>=7} onChange={event=>{const next=event.currentTarget.checked?[...value||[],entry.id]:(value||[]).filter(id=>id!==entry.id);onChange(next.length?next:undefined)}}/>)}{entries?.length===0&&<Text size="sm" c="dimmed">{ft('No encrypted knowledge collections available')}</Text>}{!entries&&!!value?.length&&<Text size="xs">{value.length} {ft('Collections selected')}</Text>}</Stack>
}
