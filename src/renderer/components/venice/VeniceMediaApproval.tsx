import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Button, Code, Group, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaApprovalContext } from '@shared/providers/definitions/models/venice/tools'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { sessionApprovals, type ApprovalMode } from '@/packages/venice/session-approvals'
import { ApprovalModeOptions } from './VeniceSessionApprovals'
export const VeniceMediaApproval = NiceModal.create(({ message, sessionId, generation, request }: { message: string; sessionId: string; generation: boolean; request?: MediaApprovalContext }) => {
  const modal = useModal(); const { t } = useTranslation(); const [mode, setMode] = useState<ApprovalMode>(() => sessionApprovals.mode(sessionId))
  usePrivacyDismiss(modal,{approved:false,mode:'ask'})
  useEffect(()=>setMode(sessionApprovals.mode(sessionId)),[sessionId,message,modal.visible])
  const close = (approved: boolean) => { modal.resolve({ approved, mode }); modal.hide() }
  useEffect(()=>{const signal=request?.signal;const abort=()=>close(false);if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});return()=>signal?.removeEventListener('abort',abort)},[request?.signal])
  const kinds={speech:'Voice',video:'Video',music:'Music','sound-effects':'Sound effects','voice-conversion':'Voice conversion',transcription:'Transcribe'}
  return <AdaptiveModal opened={modal.visible} onClose={() => close(false)} title={t('Venice tool approval')}><Stack>
    {request ? <><Text>{generation ? t('Generate {{kind}} with {{model}}?',{kind:t(kinds[request.kind || 'speech']),model:request.model}) : t(request.action==='delete_local'?'Delete generation {{id}} from this device? The remote copy will remain.':'Delete generation {{id}} on Venice?',{id:request.id})}</Text>{generation&&<><Text size="sm">{t('Content is sent to Venice. Generation may incur a cost.')}</Text><Code block style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{request.prompt}</Code><Code block>{JSON.stringify(request.options || {},null,2)}</Code></>}</> : <Code block>{message}</Code>}
    {generation && <><ApprovalModeOptions value={mode} onChange={setMode} /><Alert color="blue">{t('Automatic approval can generate paid content in this chat without further prompts.')}</Alert></>}
    <Group justify="end"><Button variant="default" onClick={() => close(false)}>{t('Cancel')}</Button><Button onClick={() => close(true)}>{t('Approve')}</Button></Group>
  </Stack></AdaptiveModal>
})
