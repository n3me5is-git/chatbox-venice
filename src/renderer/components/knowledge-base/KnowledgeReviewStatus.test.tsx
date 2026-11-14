// @vitest-environment jsdom
import {cleanup,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {KnowledgeCheckReportSchema,knowledgeAnswerHash,KNOWLEDGE_VERIFICATION_INFO} from '@shared/knowledge-verification'
vi.mock('@ebay/nice-modal-react',()=>({default:{create:(value:any)=>value,show:vi.fn()},useModal:vi.fn()}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:()=>null}))
vi.mock('@/components/security/usePrivacyDismiss',()=>({usePrivacyDismiss:vi.fn()}))
import {CitationReviewBadge,KnowledgeReviewScope} from './KnowledgeReviewStatus'
afterEach(cleanup)
it('shows source assessments only for the exact reviewed answer, and immediately hides them on edits',async()=>{
 const text='The deadline is Friday.',url='https://example.org/source',hash=await knowledgeAnswerHash(text),report=KnowledgeCheckReportSchema.parse({version:1,id:crypto.randomUUID(),answerHash:hash,draftHash:hash,created:1,status:'checked',reason:'complete',revised:false,calls:1,coverage:1,omittedEvidence:0,sources:[{id:'s',origin:'external',name:'Source',url}],claims:[{start:0,end:text.length,text,verdict:'supported',reason:'Direct quotation',evidence:[{id:'s',quote:text,stance:'supports'}]}]})
 const parts=(value:string):any=>[{type:'text',text:value},{type:'info',text:KNOWLEDGE_VERIFICATION_INFO,values:{report}}]
 const view=render(<KnowledgeReviewScope parts={parts(text)}><CitationReviewBadge href={url}/></KnowledgeReviewScope>);await waitFor(()=>expect(screen.getByRole('button',{name:'View source review'}).textContent).toBe('✅'))
 view.rerender(<KnowledgeReviewScope parts={parts('Edited answer')}><CitationReviewBadge href={url}/></KnowledgeReviewScope>);expect(screen.queryByRole('button')).toBeNull()
})
