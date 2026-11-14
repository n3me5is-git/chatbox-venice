import type {MessageContentParts} from '@shared/types'
import {KNOWLEDGE_VERIFICATION_INFO} from '@shared/knowledge-verification'
import {knowledgeAnswerText} from '@shared/knowledge-publication'
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import NiceModal,{useModal} from '@ebay/nice-modal-react'
import {Alert,Anchor,Badge,Button,Group,Stack,Text} from '@mantine/core'
import {useTranslation} from 'react-i18next'
import {KnowledgeCheckReportSchema,knowledgeAnswerHash,type KnowledgeCheckReport} from '@shared/knowledge-verification'
import {parseKnowledgeEvidenceUrl} from '@shared/knowledge-evidence'
import {AdaptiveModal} from '@/components/common/AdaptiveModal'
import {usePrivacyDismiss} from '@/components/security/usePrivacyDismiss'
import {forkT as ft} from '@/i18n/fork'
export const KnowledgeReviewContext=createContext<KnowledgeCheckReport|undefined>(undefined)
export function KnowledgeReviewScope({parts=[],children}:{parts:MessageContentParts;children:ReactNode}){
 const part=parts.find(part=>part.type==='info'&&part.text===KNOWLEDGE_VERIFICATION_INFO),value=part?.type==='info'?part.values?.report:undefined,parsed=KnowledgeCheckReportSchema.safeParse(value),answer=knowledgeAnswerText(parts),report=parsed.success?parsed.data:undefined
 const [verified,setVerified]=useState<{answer:string;report:KnowledgeCheckReport}>()
 useEffect(()=>{let active=true;if(report)void knowledgeAnswerHash(answer).then(hash=>{if(active)setVerified(hash===report.answerHash?{answer,report}:undefined)});else setVerified(undefined);return()=>{active=false}},[answer,report?.id,report?.answerHash])
 return <KnowledgeReviewContext.Provider value={verified?.answer===answer&&verified?.report.id===report?.id?verified.report:undefined}>{children}</KnowledgeReviewContext.Provider>
}
const icons={supported:'✅',contradicted:'⛔',mixed:'⚠️',insufficient:'❔'} as const
const labels={supported:'Supported by sources',contradicted:'Conflicts with sources',mixed:'Sources disagree',insufficient:'Source support not established'} as const
const reasons={no_sources:'No source excerpts were available for this answer',budget:'The answer or source context exceeded the review limit',verifier_failed:'The verifier could not complete the review',revision_failed:'The correction could not be verified',invalid_judgment:'The review response was invalid',partial_coverage:'Some statements or evidence could not be fully checked',conflict:'Conflicting statements remain',complete:'Answer checked against the supplied sources'} as const
function ReviewDetails({report,focus}:{report:KnowledgeCheckReport;focus?:string}){
 useTranslation();return <Stack gap="md"><Alert color={report.status==='checked'?'teal':'yellow'}>{ft(reasons[report.reason])}</Alert><Text size="xs" c="dimmed">{ft('A source review is a model assessment, not a guarantee of truth. It is separate from encryption and attestation.')}</Text><Text size="xs">{ft('Review model')}: {report.model?.model} · {report.calls} {ft('Model calls')}{report.revised?' · '+ft('Answer revised after review'):''}</Text>{report.claims.map((claim,index)=><Stack key={index} gap="xs" p="sm" style={{border:'1px solid var(--mantine-color-default-border)',borderRadius:8}}><Text fw={500}>{icons[claim.verdict]} {ft(labels[claim.verdict])}</Text><Text style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{claim.text}</Text><Text size="sm" c="dimmed">{claim.reason}</Text>{!claim.evidence.length&&<Badge variant="light" color="gray">{ft('Model / no independent source')}</Badge>}{claim.evidence.map((evidence,n)=>{const source=report.sources.find(source=>source.id===evidence.id);if(!source)return null;const local=parseKnowledgeEvidenceUrl(source.url);return <Stack key={n} gap={4}><Text size="xs">{source.origin==='external'?ft('External source'):ft('Knowledge source')} · {source.name}</Text><Text size="sm" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{evidence.quote}</Text>{local?<Button size="xs" variant="subtle" onClick={()=>void import('./KnowledgeEvidence').then(module=>module.openKnowledgeEvidence(local))}>{ft('Open source excerpt')}</Button>:<Anchor href={source.url} target="_blank" rel="noreferrer">{ft('Open external source')}</Anchor>}</Stack>})}</Stack>)}</Stack>
}
const createReviewModal=()=>NiceModal.create((props:{report:KnowledgeCheckReport;focus?:string})=>{const modal=useModal();usePrivacyDismiss(modal,null);const close=()=>{modal.resolve(null);modal.remove()};return <AdaptiveModal opened={modal.visible} onClose={close} title={ft('Source review')} size="xl"><ReviewDetails {...props}/></AdaptiveModal>})
export const openKnowledgeReview=(report:KnowledgeCheckReport,focus?:string)=>NiceModal.show(createReviewModal(),{report,focus})
export function KnowledgeReviewStatus({value,answer}:{value:unknown;answer:string}){
 useTranslation();const parsed=KnowledgeCheckReportSchema.safeParse(value),[match,setMatch]=useState<string>(),report=parsed.success?parsed.data:undefined
 useEffect(()=>{let active=true;setMatch(undefined);if(report)void knowledgeAnswerHash(answer).then(hash=>{if(active)setMatch(hash===report.answerHash?answer:undefined)});return()=>{active=false}},[answer,report?.answerHash])
 if(!report)return null
 const valid=match===answer
 return <Group gap="xs" wrap="wrap"><Button variant="light" size="xs" color={valid&&report.status==='checked'?'teal':'yellow'} onClick={()=>void openKnowledgeReview(valid?report:{...report,status:'unverified',reason:'invalid_judgment'})}>{valid&&report.status==='checked'?'✅':'❔'} {ft(valid&&report.status==='checked'?'Checked against sources':'Review needs attention')}</Button>{report.revised&&<Text size="xs" c="dimmed">{ft('Answer revised after review')}</Text>}</Group>
}
export function CitationReviewBadge({href}:{href:string|undefined}){
 useTranslation();const report=useContext(KnowledgeReviewContext);if(!report||!href||!/^https?:\/\//.test(href))return null
 const source=report.sources.find(source=>source.url===href),claims=source?report.claims.filter(claim=>claim.evidence.some(item=>item.id===source.id)):[],verdict=claims.some(claim=>claim.verdict==='contradicted')?'contradicted':claims.some(claim=>claim.verdict==='mixed')?'mixed':claims.length&&claims.every(claim=>claim.verdict==='supported')&&report.status==='checked'?'supported':'insufficient'
 return <button type="button" aria-label={ft('View source review')} title={ft(labels[verdict])} onClick={event=>{event.preventDefault();event.stopPropagation();void openKnowledgeReview(report,source?.id)}} style={{border:0,background:'none',cursor:'pointer',padding:'0 3px',fontSize:'0.8em',verticalAlign:'baseline'}}>{icons[verdict]}</button>
}
