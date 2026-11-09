import { ActionIcon, Loader } from '@mantine/core'
import { IconDatabaseSearch } from '@tabler/icons-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { forkT as ft } from '@/i18n/fork'
const Panel=lazy(()=>import('./SessionRag').then(module=>({default:module.SessionRagPanel})))
export function SessionRagButton({sessionId}:{sessionId:string}){useTranslation();const [open,setOpen]=useState(false);useEffect(()=>{if(process.env.NODE_ENV!=='test')void import('@/packages/session-rag/service').then(module=>module.startRagMonitoring())},[]);return <><ActionIcon size="lg" variant="subtle" title={ft('Session RAG and workspace')} aria-label={ft('Session RAG and workspace')} style={{flexShrink:0}} onClick={()=>setOpen(true)}><IconDatabaseSearch size={20}/></ActionIcon><AdaptiveModal opened={open} onClose={()=>setOpen(false)} title={ft('Session RAG and workspace')} size="lg">{open&&<Suspense fallback={<Loader size="sm"/>}><Panel sessionId={sessionId}/></Suspense>}</AdaptiveModal></>}
