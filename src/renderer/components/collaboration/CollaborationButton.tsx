import { ActionIcon,Indicator } from '@mantine/core'
import { IconUsers } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import {useEffect,useState} from 'react'
import {sharedChatStatus,subscribeSharedChatStatus} from '@/packages/collaboration/bridge'
export async function openCollaboration(sessionId?:string){const module=await import('./CollaborationPanel');await module.openCollaborationPanel(sessionId)}
export function CollaborationButton({sessionId}:{sessionId:string}){useTranslation();const [status,setStatus]=useState(()=>sharedChatStatus(sessionId));useEffect(()=>{const update=()=>setStatus(sharedChatStatus(sessionId));update();return subscribeSharedChatStatus(update)},[sessionId]);return <Indicator inline disabled={!status.pending} label={status.pending} size={16}><ActionIcon size="lg" variant="subtle" color={status.active?'green':undefined} data-sharing-active={status.active} title={(status.active?ft('Sharing is active')+' · ':'')+ft('Share and collaborate')} aria-label={ft('Share and collaborate')} onClick={()=>void openCollaboration(sessionId)}><IconUsers size={20}/></ActionIcon></Indicator>}
