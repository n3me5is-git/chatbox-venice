import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Button, Code, Group, Stack, Text, Textarea } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaApprovalContext } from '@shared/providers/definitions/models/venice/tools'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { sessionApprovals, type ApprovalMode } from '@/packages/venice/session-approvals'
import { ApprovalModeOptions } from './VeniceSessionApprovals'
import type { MediaCatalogItem } from '@shared/providers/definitions/models/venice/media'
import { parseExtraBody } from '@shared/models/utils/extra-body'
import { assertMediaToolOptions } from '@shared/providers/definitions/models/venice/call-options'
import { MediaCallParameters } from './MediaCallParameters'
import { VeniceModelInfo } from './VeniceModelInfo'
import { VeniceModelCost } from './VeniceModelCost'
export const VeniceMediaApproval = NiceModal.create(({ message, sessionId, generation, request, catalogModel }: { message: string; sessionId: string; generation: boolean; request?: MediaApprovalContext;catalogModel?:MediaCatalogItem }) => {
  const modal = useModal(); const { t } = useTranslation(); const [mode, setMode] = useState<ApprovalMode>(() => sessionApprovals.mode(sessionId))
  usePrivacyDismiss(modal,{approved:false,mode:'ask'})
  useEffect(()=>setMode(sessionApprovals.mode(sessionId)),[sessionId,message,modal.visible])
  const [prompt,setPrompt]=useState(request?.prompt||''),[parameters,setParameters]=useState(JSON.stringify(request?.options||{},null,2)),[error,setError]=useState('')
  useEffect(()=>{setPrompt(request?.prompt||'');setParameters(JSON.stringify(request?.options||{},null,2));setError('')},[request,modal.visible])
  const close = (approved: boolean) => {
    try {
      const options=approved&&generation&&request?parseExtraBody(parameters)||{}:undefined
      if(options)assertMediaToolOptions(request?.kind||'',options)
      if(approved&&generation&&request&&!prompt.trim())throw Error('Enter a prompt before approving this generation.')
      modal.resolve({ approved, mode, ...(options?{options,prompt}: {}) }); modal.hide()
    }catch(error){setError(String(t((error as Error).message)))}
  }
  useEffect(()=>{const signal=request?.signal;const abort=()=>close(false);if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});return()=>signal?.removeEventListener('abort',abort)},[request?.signal])
  const kinds={speech:'Voice',video:'Video',music:'Music','sound-effects':'Sound effects','voice-conversion':'Voice conversion',transcription:'Transcribe'}
  return <AdaptiveModal opened={modal.visible} onClose={() => close(false)} title={t('Venice tool approval')}><Stack>
    {request ? <><Text>{generation ? t('Generate {{kind}} with {{model}}?',{kind:t(kinds[request.kind || 'speech']),model:request.model}) : t(request.action==='delete_local'?'Delete generation {{id}} from this device? The remote copy will remain.':'Delete generation {{id}} on Venice?',{id:request.id})}</Text>{generation&&<><Text size="sm">{t('Content is sent to Venice. Generation may incur a cost.')}</Text>{catalogModel&&<Group><VeniceModelCost model={catalogModel} comparison showLabel/><VeniceModelInfo model={catalogModel}/></Group>}<Textarea label={t('Prompt to send')} value={prompt} onChange={event=>setPrompt(event.currentTarget.value)} autosize minRows={3}/><MediaCallParameters kind={request.kind} model={catalogModel} value={parameters} onChange={setParameters}/></>}</> : <Code block>{message}</Code>}
    {error&&<Alert color="red">{error}</Alert>}
    {generation && <><ApprovalModeOptions value={mode} onChange={setMode} /><Alert color="blue">{t('Automatic approval can generate paid content in this chat without further prompts.')}</Alert></>}
    <Group justify="end"><Button variant="default" onClick={() => close(false)}>{t('Cancel')}</Button><Button onClick={() => close(true)}>{t('Approve')}</Button></Group>
  </Stack></AdaptiveModal>
})
