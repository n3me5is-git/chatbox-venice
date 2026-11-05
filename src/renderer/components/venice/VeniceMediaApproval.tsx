import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Button, Code, Group, Stack } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { sessionApprovals, type ApprovalMode } from '@/packages/venice/session-approvals'
import { ApprovalModeSelect } from './VeniceSessionApprovals'
export const VeniceMediaApproval = NiceModal.create(({ message, sessionId, generation }: { message: string; sessionId: string; generation: boolean }) => {
  const modal = useModal(); const { t } = useTranslation(); const [mode, setMode] = useState<ApprovalMode>(() => sessionApprovals.mode(sessionId))
  useEffect(()=>setMode(sessionApprovals.mode(sessionId)),[sessionId,message])
  const close = (approved: boolean) => { modal.resolve({ approved, mode }); modal.hide() }
  return <AdaptiveModal opened={modal.visible} onClose={() => close(false)} title={t('Venice tool approval')}><Stack><Code block style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{message}</Code>{generation && <><ApprovalModeSelect value={mode} onChange={setMode} /><Alert color="blue">{t('Automatic approval can generate paid content in this chat without further prompts.')}</Alert></>}<Group justify="end"><Button variant="default" onClick={() => close(false)}>{t('Cancel')}</Button><Button onClick={() => close(true)}>{t('Approve')}</Button></Group></Stack></AdaptiveModal>
})
