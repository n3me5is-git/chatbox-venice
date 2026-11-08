import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { Alert,Button,Group,Stack,Text } from '@mantine/core'
import { useEffect } from 'react'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { forkT as ft } from '@/i18n/fork'
const SpeechConsent=NiceModal.create(({signal}:{signal:AbortSignal})=>{
  const modal=useModal();usePrivacyDismiss(modal,false)
  const finish=(approved:boolean)=>{modal.resolve(approved);modal.remove()}
  useEffect(()=>{const cancel=()=>finish(false);if(signal.aborted)cancel();signal.addEventListener('abort',cancel,{once:true});return()=>signal.removeEventListener('abort',cancel)},[signal])
  return <AdaptiveModal opened={modal.visible} onClose={()=>finish(false)} title={ft('Speech privacy warning')}><Stack>
    <Alert color="yellow">{ft('Speech does not use the chat model’s E2EE. Your recording or reply text will be sent over HTTPS to the selected private speech provider.')}</Alert>
    <Text size="sm">{ft('Private is a provider privacy claim. The speech request is not end-to-end encrypted. This permission applies only to this request.')}</Text>
    <Group justify="end"><Button variant="default" onClick={()=>finish(false)}>{ft('Cancel')}</Button><Button onClick={()=>finish(true)}>{ft('Continue for this request')}</Button></Group>
  </Stack></AdaptiveModal>
})
export async function requestSpeechConsent(signal:AbortSignal){return await NiceModal.show(SpeechConsent,{signal})===true}
