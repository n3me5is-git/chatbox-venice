import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { Alert,Button,Code,Group,Stack,Text } from '@mantine/core'
import { useEffect } from 'react'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { forkT as ft } from '@/i18n/fork'
import type { LocalMCPGrant } from '@shared/local-mcp'
type Input={provider:string;modelId:string;messages:{role:string;content:string}[];maxOutputTokens:number}
const ExternalModelApproval=NiceModal.create(({input,signal}:{input:Input;signal?:AbortSignal})=>{
  const modal=useModal();usePrivacyDismiss(modal,false)
  const close=(approved:boolean)=>{modal.resolve(approved);modal.hide()}
  useEffect(()=>{const abort=()=>close(false);if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});return()=>signal?.removeEventListener('abort',abort)},[signal])
  return <AdaptiveModal opened={modal.visible} onClose={()=>close(false)} title={ft('External agent model request')} size="lg"><Stack>
    <Text fw={600}>{input.provider} · {input.modelId}</Text>
    <Alert color="yellow">{ft('An external local agent wants to send these messages to this model. Provider charges may apply. The model uses this chat’s privacy settings; app credentials are not returned to the client.')}</Alert>
    <Text size="sm">{ft('Maximum output tokens')}: {input.maxOutputTokens}</Text>
    <Code block style={{maxHeight:'45dvh',overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(input.messages,null,2)}</Code>
    <Group justify="end"><Button variant="default" onClick={()=>close(false)}>{ft('Cancel')}</Button><Button onClick={()=>close(true)}>{ft('Approve model call')}</Button></Group>
  </Stack></AdaptiveModal>
})
export async function requestExternalModelApproval(_grant:LocalMCPGrant,input:Input,signal?:AbortSignal){return await NiceModal.show(ExternalModelApproval,{input,signal})===true}
