import {useContext} from 'react'
import type {Message} from '@shared/types'
import {ReasoningContentUI} from '@/components/message-parts/StepTimelineUI'
import {KnowledgeReviewContext} from './KnowledgeReviewStatus'
import {forkT as ft} from '@/i18n/fork'
/** Display-only projection of a hash-bound report. Never create provider replay parts. */
export function KnowledgeReviewThinking({message,onCopyReasoningContent}:{message:Message;onCopyReasoningContent:(content:string)=>(event:React.MouseEvent<HTMLButtonElement>)=>void}){
 const report=useContext(KnowledgeReviewContext)
 if(!report?.reasoning?.length)return null
 return <div data-knowledge-review-thinking>{report.reasoning.map((row,index)=><ReasoningContentUI key={report.id+':'+index} message={{...message,generating:false}} part={{type:'reasoning',text:row.text}} label={ft(row.phase==='correcting'?'Source correction thinking':'Fact-check thinking')} onCopyReasoningContent={onCopyReasoningContent}/>)}</div>
}
