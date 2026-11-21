import {useMemo,useState} from 'react'
import {Alert,Badge,Button,Group,Stack,Text,TextInput} from '@mantine/core'
import type {KnowledgeCheckReport} from '@shared/knowledge-verification'
import {parseKnowledgeEvidenceUrl} from '@shared/knowledge-evidence'
import {forkT as ft} from '@/i18n/fork'
import {useTranslation} from 'react-i18next'
import {ReviewMarkdown} from './ReviewMarkdown'
const icons={supported:'✅',contradicted:'⛔',mixed:'⚠️',insufficient:'❔'} as const
const labels={supported:'Supported by sources',contradicted:'Conflicts with sources',mixed:'Sources disagree',insufficient:'Source support not established'} as const
const reasons={no_sources:'No source excerpts were available for this answer',budget:'The answer or source context exceeded the review limit',verifier_failed:'The verifier could not complete the review',revision_failed:'The correction could not be verified',invalid_judgment:'The review response was invalid',partial_coverage:'Some statements or evidence could not be fully checked',conflict:'Conflicting statements remain',complete:'Answer checked against the supplied sources'} as const
export function KnowledgeReviewDetails({report,focus,claimIndex}:{report:KnowledgeCheckReport;focus?:string;claimIndex?:number}){
 useTranslation()
 const [onlySource,setOnlySource]=useState(focus),[selected,setSelected]=useState(claimIndex),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[raw,setRaw]=useState(false)
 const counts=useMemo(()=>Object.fromEntries(Object.keys(labels).map(key=>[key,report.claims.filter(claim=>claim.verdict===key).length])),[report])
 const claims=report.claims.filter((claim,index)=>(selected===undefined||index===selected)&&(!onlySource||claim.evidence.some(row=>row.id===onlySource))&&(filter==='all'||claim.verdict===filter)&&(!query.trim()||[claim.text,claim.reason,...claim.evidence.flatMap(row=>[row.quote,report.sources.find(source=>source.id===row.id)?.name||''])].join('\n').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
 const content=(text:string)=>raw?<Text component="pre" size="sm" style={{margin:0,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</Text>:<ReviewMarkdown text={text}/>
 return <Stack gap="md" style={{minWidth:0}}>
  <Alert color={report.status==='checked'?'teal':'yellow'}>{ft(reasons[report.reason])}</Alert>
  {report.failure&&<Alert color="yellow">{ft(report.failure.message)}</Alert>}
  <Group gap="xs" wrap="wrap">{Object.entries(labels).map(([key,label])=><Badge key={key} variant="light" color={key==='supported'?'teal':key==='contradicted'?'red':'gray'}>{icons[key as keyof typeof icons]} {counts[key]} · {ft(label)}</Badge>)}</Group>
  <Text size="xs" c="dimmed" style={{overflowWrap:'anywhere'}}>{ft('Review model')}: {report.model?.model||'—'} · {report.calls} {ft('Model calls')}{report.revised?' · '+ft('Answer revised after review'):''}</Text>
  {report.followUp&&<Text size="xs" c="dimmed">
   {ft('Extra searches: {{searches}} · New excerpts: {{evidence}}',{searches:report.followUp.searches,evidence:report.followUp.evidenceAdded})}
   {report.followUp.interrupted?' · '+ft('Extra search was interrupted'):''}
  </Text>}
  <TextInput label={ft('Search statements and evidence')} value={query} onChange={event=>setQuery(event.currentTarget.value)}/>
  <Group gap="xs" wrap="wrap"><Button variant={filter==='all'?'light':'subtle'} size="xs" mih={40} onClick={()=>setFilter('all')}>{ft('All statements')}</Button>{Object.entries(labels).filter(([key])=>counts[key]).map(([key,label])=><Button key={key} variant={filter===key?'light':'subtle'} size="xs" mih={40} onClick={()=>setFilter(key)}>{ft(label)}</Button>)}<Button variant="default" size="xs" mih={40} onClick={()=>setRaw(value=>!value)}>{ft(raw?'Render Markdown and formulas':'View raw text')}</Button></Group>
  {(onlySource||selected!==undefined)&&<Group><Text size="xs">{ft(onlySource?'Claims linked to this source':'Selected statement')}</Text><Button variant="subtle" size="xs" mih={40} onClick={()=>{setOnlySource(undefined);setSelected(undefined);setFilter('all')}}>{ft('Show all statements')}</Button></Group>}
  {!claims.length&&<Text c="dimmed">{ft('No statements match these filters.')}</Text>}
  {claims.map((claim,index)=><Stack key={index} gap="sm" p="md" style={{border:'1px solid var(--mantine-color-default-border)',borderRadius:12,minWidth:0}}>
   <Text fw={600}>{icons[claim.verdict]} {ft(labels[claim.verdict])}</Text>
   {content(claim.text)}
   <div style={{fontSize:14,color:'var(--chatbox-tint-secondary)'}}>{content(claim.reason)}</div>
   {!claim.evidence.length&&<Badge variant="light" color="gray" style={{whiteSpace:'normal',height:'auto'}}>{ft('Model / no independent source')}</Badge>}
   {claim.evidence.map((evidence,n)=>{const source=report.sources.find(source=>source.id===evidence.id);if(!source)return null;const local=parseKnowledgeEvidenceUrl(source.url),color=evidence.stance==='contradicts'?'red':evidence.stance==='supports'?'teal':'gray';return <Stack key={n} gap="xs" p="sm" style={{borderLeft:`3px solid var(--mantine-color-${color}-6)`,background:'var(--chatbox-background-secondary)',borderRadius:6,minWidth:0}}>
    <Group justify="space-between" gap="xs" wrap="wrap"><Badge variant="light" color={color}>{ft(evidence.stance==='contradicts'?'Contradicting source':evidence.stance==='supports'?'Supporting source':'Context source')}</Badge><Text size="xs" c="dimmed">{ft(source.origin==='external'?'External source':'Knowledge source')}</Text></Group>
    <Text size="sm" fw={500} style={{overflowWrap:'anywhere'}}>{source.name}</Text>
    <div style={{maxHeight:'38dvh',overflowY:'auto',overscrollBehavior:'contain',touchAction:'pan-y',minWidth:0}}>{content(evidence.quote)}</div>
    <Button size="xs" variant="light" mih={40} onClick={()=>{if(local)void import('./KnowledgeEvidence').then(module=>module.openKnowledgeEvidence(local));else {try{const url=new URL(source.url);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)void import('@/platform').then(({default:platform})=>platform.openLink(url.href))}catch{}}}}>{ft(local?'Open source excerpt':'Open external source')}</Button>
   </Stack>})}
  </Stack>)}
  {report.reasoning?.map((row,index)=><details key={index}><summary style={{cursor:'pointer',padding:'10px 0'}}>{ft(row.phase==='correcting'?'Correction reasoning':'Checker reasoning')}</summary><Text component="pre" size="xs" style={{maxHeight:'40dvh',overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.text}</Text></details>)}
  <Text size="xs" c="dimmed">{ft('A source review is a model assessment, not a guarantee of truth. It is separate from encryption and attestation.')}</Text>
 </Stack>
}
