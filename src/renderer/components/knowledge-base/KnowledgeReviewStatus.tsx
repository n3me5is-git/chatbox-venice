import {KnowledgeReviewDetails as ReviewDetails} from './KnowledgeReviewDetails'
import type {MessageContentParts} from '@shared/types'
import {KNOWLEDGE_VERIFICATION_INFO} from '@shared/knowledge-verification'
import {knowledgeReportedAnswerText} from '@shared/knowledge-publication'
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import NiceModal,{useModal} from '@ebay/nice-modal-react'
import {Button,Group,Text} from '@mantine/core'
import {useTranslation} from 'react-i18next'
import {KnowledgeCheckReportSchema,knowledgeAnswerHash,type KnowledgeCheckReport} from '@shared/knowledge-verification'
import {parseKnowledgeEvidenceUrl} from '@shared/knowledge-evidence'
import {AdaptiveModal} from '@/components/common/AdaptiveModal'
import {usePrivacyDismiss} from '@/components/security/usePrivacyDismiss'
import {forkT as ft} from '@/i18n/fork'
export const KnowledgeAnswerContext=createContext('')
export const KnowledgeReviewContext=createContext<KnowledgeCheckReport|undefined>(undefined)
export function KnowledgeReviewScope({parts=[],children}:{parts:MessageContentParts;children:ReactNode}){
 const part=parts.find(part=>part.type==='info'&&part.text===KNOWLEDGE_VERIFICATION_INFO),value=part?.type==='info'?part.values?.report:undefined,parsed=KnowledgeCheckReportSchema.safeParse(value),answer=knowledgeReportedAnswerText(parts),report=parsed.success?parsed.data:undefined
 const [verified,setVerified]=useState<{answer:string;report:KnowledgeCheckReport}>()
 useEffect(()=>{let active=true;if(report)void knowledgeAnswerHash(answer).then(hash=>{if(active)setVerified(hash===report.answerHash?{answer,report}:undefined)});else setVerified(undefined);return()=>{active=false}},[answer,report?.id,report?.answerHash])
 return <KnowledgeAnswerContext.Provider value={answer}><KnowledgeReviewContext.Provider value={verified?.answer===answer&&verified?.report.id===report?.id?verified.report:undefined}>{children}</KnowledgeReviewContext.Provider></KnowledgeAnswerContext.Provider>
}
const icons={supported:'✅',contradicted:'⛔',mixed:'⚠️',insufficient:'❔'} as const
const labels={supported:'Supported by sources',contradicted:'Conflicts with sources',mixed:'Sources disagree',insufficient:'Source support not established'} as const
const createReviewModal=()=>NiceModal.create((props:{report:KnowledgeCheckReport;focus?:string;claimIndex?:number})=>{useTranslation();const modal=useModal();usePrivacyDismiss(modal,null);const close=()=>{modal.resolve(null);modal.remove()};return <AdaptiveModal opened={modal.visible} onClose={close} title={ft('Source review')} size="min(1100px, calc(100vw - 48px))"><ReviewDetails {...props}/></AdaptiveModal>})
export const openKnowledgeReview=(report:KnowledgeCheckReport,focus?:string,claimIndex?:number)=>NiceModal.show(createReviewModal(),{report,focus,claimIndex})
export function KnowledgeReviewStatus({value,answer}:{value:unknown;answer:string}){
 useTranslation();const parsed=KnowledgeCheckReportSchema.safeParse(value),[match,setMatch]=useState<string>(),report=parsed.success?parsed.data:undefined
 useEffect(()=>{let active=true;setMatch(undefined);if(report)void knowledgeAnswerHash(answer).then(hash=>{if(active)setMatch(hash===report.answerHash?answer:undefined)});return()=>{active=false}},[answer,report?.answerHash])
 if(!report)return null
 const valid=match===answer
 return <Group gap="xs" wrap="wrap"><Button variant="light" size="xs" color={valid&&report.status==='checked'?'teal':'yellow'} onClick={()=>void openKnowledgeReview(valid?report:{...report,status:'unverified',reason:'invalid_judgment'})}>{valid&&report.status==='checked'?'✅':'❔'} {ft(valid&&report.status==='checked'?'Checked against sources':valid&&report.status==='incomplete'?'Partially checked against sources':'Review needs attention')}</Button>{report.revised&&<Text size="xs" c="dimmed">{ft('Answer revised after review')}</Text>}</Group>
}
export function CitationReviewBadge({href}:{href:string|undefined}){
 useTranslation();const report=useContext(KnowledgeReviewContext);if(!report||!href||!/^https?:\/\//.test(href))return null
 const source=report.sources.find(source=>source.url===href),claims=source?report.claims.filter(claim=>claim.evidence.some(item=>item.id===source.id)):[],verdict=claims.some(claim=>claim.verdict==='contradicted')?'contradicted':claims.some(claim=>claim.verdict==='mixed')?'mixed':claims.length&&claims.every(claim=>claim.verdict==='supported')?'supported':'insufficient'
 return <button type="button" aria-label={ft('View source review')} title={ft(labels[verdict])} onClick={event=>{event.preventDefault();event.stopPropagation();void openKnowledgeReview(report,source?.id)}} style={{border:0,background:'none',cursor:'pointer',padding:'0 3px',fontSize:'0.8em',verticalAlign:'baseline'}}>{icons[verdict]}</button>
}

export function ClaimReviewBadge({index}:{index:number}){const report=useContext(KnowledgeReviewContext),claim=report?.claims[index];if(!report||!claim)return null;const origins=new Set(claim.evidence.map(item=>report.sources.find(source=>source.id===item.id)?.origin)),origin=origins.has('knowledge')?(origins.has('external')?'KB + Online':'KB'):origins.has('external')?'Online':'Model';return <button type="button" aria-label={ft('Review this statement')} title={ft(labels[claim.verdict])+' · '+origin} onClick={event=>{event.preventDefault();event.stopPropagation();void openKnowledgeReview(report,undefined,index)}} style={{border:0,borderRadius:12,background:'var(--chatbox-background-tertiary)',cursor:'pointer',padding:'1px 5px',margin:'0 3px',fontSize:'.75em',whiteSpace:'nowrap'}}>{icons[claim.verdict]} {origin}</button>}
