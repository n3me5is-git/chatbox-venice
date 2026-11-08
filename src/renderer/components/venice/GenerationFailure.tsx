import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { Alert,Button,Group,Stack,Text } from '@mantine/core'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { FailedGeneration } from '@shared/generation-retry'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { forkT as ft } from '@/i18n/fork'
export function GenerationFailureContent({failure,onRetry,onSkip}:{failure:FailedGeneration;onRetry:()=>void;onSkip:()=>void}){
  useTranslation()
  return <Stack><Alert color="red" title={ft('The previous generation failed')}><Text size="sm" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{failure.error.slice(0,3000)||ft('The provider did not supply an error reason.')}</Text></Alert>
    <Text size="sm">{failure.kind} · {failure.model}</Text>
    <Text size="sm">{ft('Retry starts a new generation and may incur another charge. Skipping stops further retry prompts for this failed job until you send a new message.')}</Text>
    <Group justify="end"><Button variant="default" onClick={onSkip}>{ft('Skip generation')}</Button><Button onClick={onRetry}>{ft('Retry generation')}</Button></Group>
  </Stack>
}
const FailureModal=NiceModal.create(({failure,signal}:{failure:FailedGeneration;signal?:AbortSignal})=>{
  const modal=useModal();usePrivacyDismiss(modal,false)
  const finish=(approved:boolean)=>{modal.resolve(approved);modal.remove()}
  useEffect(()=>{const cancel=()=>finish(false);if(signal?.aborted)cancel();signal?.addEventListener('abort',cancel,{once:true});return()=>signal?.removeEventListener('abort',cancel)},[signal])
  return <AdaptiveModal opened={modal.visible} onClose={()=>finish(false)} title={ft('Generation needs attention')}><GenerationFailureContent failure={failure} onRetry={()=>finish(true)} onSkip={()=>finish(false)}/></AdaptiveModal>
})
export async function requestGenerationRetry(failure:FailedGeneration,signal?:AbortSignal){return await NiceModal.show(FailureModal,{failure,signal})===true}
