import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { Alert,Button,Group,NumberInput,Select,Stack,Text,Textarea } from '@mantine/core'
import { useEffect,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { forkT as ft } from '@/i18n/fork'
export interface ChatImageChoice {modelId:string;prompt:string;count:number;aspectRatio:string}
export const ChatImageApproval=NiceModal.create(({models,request,signal}:{models:{id:string;name:string}[];request:ChatImageChoice;signal?:AbortSignal})=>{
  useTranslation();const modal=useModal(),[choice,setChoice]=useState(request);usePrivacyDismiss(modal,null)
  const cancel=()=>{modal.resolve(null);modal.remove()}
  useEffect(()=>{const abort=()=>cancel();if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});return()=>signal?.removeEventListener('abort',abort)},[signal])
  return <AdaptiveModal opened={modal.visible} onClose={cancel} title={ft('Confirm ChatGPT image generation')}><Stack>
    <Alert>{ft('This request uses your ChatGPT subscription allowance. The prompt and selected references are sent to OpenAI. No automatic fallback to another provider.')}</Alert>
    <Select label={ft('Image model')} data={models.map(model=>({value:model.id,label:model.name}))} value={choice.modelId} allowDeselect={false} comboboxProps={{withinPortal:false}} onChange={value=>value&&setChoice({...choice,modelId:value})}/>
    <Textarea label={ft('Prompt to send')} autosize minRows={3} value={choice.prompt} onChange={event=>setChoice({...choice,prompt:event.currentTarget.value})}/>
    <NumberInput label={ft('Number of images')} value={choice.count} min={1} max={4} onChange={value=>setChoice({...choice,count:Math.max(1,Math.min(4,Number(value)||1))})}/>
    <Select label={ft('Aspect ratio')} data={['auto','1:1','3:2','2:3']} value={choice.aspectRatio} allowDeselect={false} comboboxProps={{withinPortal:false}} onChange={value=>value&&setChoice({...choice,aspectRatio:value})}/>
    <Text size="xs" c="dimmed">{ft('ChatGPT Images uses the image model selected by the subscription backend. Custom image IDs use their configured endpoint.')}</Text>
    <Group justify="end"><Button variant="default" onClick={cancel}>{ft('Cancel')}</Button><Button disabled={!choice.prompt.trim()||!models.some(model=>model.id===choice.modelId)} onClick={()=>{signal?.throwIfAborted();modal.resolve(choice);modal.remove()}}>{ft('Confirm and generate')}</Button></Group>
  </Stack></AdaptiveModal>
})
