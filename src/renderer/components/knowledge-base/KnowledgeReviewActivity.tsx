import {Group,Loader,Stack,Text} from '@mantine/core'
import {useSyncExternalStore} from 'react'
import {useTranslation} from 'react-i18next'
import {reviewActivity} from '@/packages/knowledge-collections/review-activity'
import {forkT as ft} from '@/i18n/fork'
export function KnowledgeReviewActivity({sessionId}:{sessionId:string}){
 useTranslation()
 useSyncExternalStore(reviewActivity.subscribe,reviewActivity.snapshot,reviewActivity.snapshot);const value=reviewActivity.get(sessionId)
 return <Stack gap={4} py={8} style={{maxWidth:'100%',minWidth:0}}><Group gap={8} wrap="nowrap"><Loader size={16}/><Text size="sm">{ft(value?.phase==='correcting'?'Correcting source conflicts':'Checking sources')}</Text></Group><details><summary style={{cursor:'pointer',fontSize:'.8rem'}}>{ft('Checker reasoning')}</summary><Text component="pre" size="xs" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'40dvh',overflow:'auto',margin:0,padding:8}}>{value?.reasoning||ft('No reasoning trace has been returned by this provider yet.')}</Text></details></Stack>
}
