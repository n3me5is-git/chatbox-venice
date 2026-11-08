import { ActionIcon } from '@mantine/core'
import { IconUsers } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
export async function openCollaboration(sessionId?:string){const module=await import('./CollaborationPanel');await module.openCollaborationPanel(sessionId)}
export function CollaborationButton({sessionId}:{sessionId:string}){useTranslation();return <ActionIcon size="lg" variant="subtle" title={ft('Share and collaborate')} aria-label={ft('Share and collaborate')} onClick={()=>void openCollaboration(sessionId)}><IconUsers size={20}/></ActionIcon>}
