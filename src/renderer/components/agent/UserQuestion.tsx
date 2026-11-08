import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { Button,Checkbox,Group,Radio,Stack,Text,Textarea } from '@mantine/core'
import { useEffect,useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UserQuestions,UserAnswers } from '@shared/user-questions'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { forkT as ft } from '@/i18n/fork'

export function UserQuestionForm({input,onSubmit,onCancel}:{input:UserQuestions;onSubmit:(answers:UserAnswers)=>void;onCancel:()=>void}){
  useTranslation();const [answers,setAnswers]=useState<UserAnswers['answers']>(()=>input.questions.map(()=>({selected:[],text:''})))
  const update=(index:number,patch:Partial<UserAnswers['answers'][number]>)=>setAnswers(current=>current.map((answer,n)=>n===index?{...answer,...patch}:answer))
  return <Stack gap="md">
    <Text size="sm" c="dimmed">{ft('Your answers are shared with the model in this chat.')}</Text>
    {input.questions.map((question,index)=><Stack key={index} gap="xs"><Text fw={600}>{question.question}</Text>
      {question.options&&(question.multiple?<Checkbox.Group value={answers[index].selected} onChange={selected=>update(index,{selected})}><Stack gap="xs">{question.options.map(option=><Checkbox key={option} label={option} value={option}/>)}</Stack></Checkbox.Group>:<Radio.Group value={answers[index].selected[0]||''} onChange={selected=>update(index,{selected:[selected]})}><Stack gap="xs">{question.options.map(option=><Radio key={option} label={option} value={option}/>)}</Stack></Radio.Group>)}
      <Textarea label={ft('Your answer')+(input.questions.length>1?' ('+(index+1)+')':'')} description={question.options?ft('You can choose an option, write your own answer, or do both.'):undefined} value={answers[index].text} onChange={event=>update(index,{text:event.currentTarget.value.slice(0,10000)})} autosize minRows={2} maxRows={6}/>
    </Stack>)}
    <Group justify="end"><Button variant="default" onClick={onCancel}>{ft('Cancel')}</Button><Button disabled={answers.some(answer=>!answer.selected.length&&!answer.text.trim())} onClick={()=>onSubmit({answers})}>{ft('Send answers')}</Button></Group>
  </Stack>
}
const QuestionModal=NiceModal.create(({input,signal}:{input:UserQuestions;signal?:AbortSignal})=>{
  const modal=useModal();usePrivacyDismiss(modal,null)
  const finish=(result:UserAnswers|null)=>{modal.resolve(result);modal.remove()}
  useEffect(()=>{const cancel=()=>finish(null);if(signal?.aborted)cancel();signal?.addEventListener('abort',cancel,{once:true});return()=>signal?.removeEventListener('abort',cancel)},[signal])
  return <AdaptiveModal opened={modal.visible} onClose={()=>finish(null)} title={ft('Question for you')}><UserQuestionForm input={input} onSubmit={finish} onCancel={()=>finish(null)}/></AdaptiveModal>
})
export async function requestUserAnswers(input:UserQuestions,signal?:AbortSignal):Promise<UserAnswers|null>{return await NiceModal.show(QuestionModal,{input,signal}) as UserAnswers|null}
