import {Alert,Stack,Text} from '@mantine/core'
import {useTranslation} from 'react-i18next'
import {forkT as ft} from '@/i18n/fork'
import type {KnowledgeSearchWarning} from '@shared/knowledge-retrieval'
export function KnowledgeSearchWarnings({result}:{result:unknown}){
 useTranslation()
 let value:any=result
 if(typeof value==='string'){if(value.length>1000000)return null;try{value=JSON.parse(value)}catch{return null}}
 const rows=(value?.warnings||value?.output?.warnings) as unknown
 if(!Array.isArray(rows))return null
 const warnings=rows.slice(0,16).filter((row):row is KnowledgeSearchWarning=>row&&['embedding','reranking'].includes(row.stage)&&typeof row.provider==='string'&&typeof row.model==='string')
 if(!warnings.length)return null
 return <Stack gap="xs">{warnings.map((row,index)=><Alert key={index} color="yellow" title={ft('Search continued with reduced ranking')}><Text size="sm">{ft(row.stage==='embedding'?'The embedding provider is temporarily unavailable. Search continued using local keyword matching; semantic matches may be missing.':'The reranker is temporarily unavailable. The original search results were retained without reranking.')}</Text><Text size="xs" style={{overflowWrap:'anywhere'}}>{row.provider} / {row.model}{row.statusCode?' · HTTP '+row.statusCode:''}</Text></Alert>)}</Stack>
}
