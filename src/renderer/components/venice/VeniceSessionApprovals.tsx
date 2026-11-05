import { useSyncExternalStore } from 'react'
import { Button, Select, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { sessionApprovals, type ApprovalMode } from '@/packages/venice/session-approvals'
export function useSessionApprovalMode(sessionId: string) {
  useSyncExternalStore(sessionApprovals.subscribe, sessionApprovals.snapshot, sessionApprovals.snapshot)
  return sessionApprovals.mode(sessionId)
}
export function ApprovalModeSelect({ value, onChange }: { value: ApprovalMode; onChange: (mode: ApprovalMode) => void }) {
  const { t } = useTranslation()
  return <Select label={t('Generation approval for this chat')} description={t('Applies to Venice image, voice, video and music tools until the app closes.')} value={value} allowDeselect={false} comboboxProps={{ withinPortal: false }} data={[{ value: 'ask', label: t('Ask every time') }, { value: 'similar', label: t('Remember similar generations after approval') }, { value: 'automatic', label: t('Automatically approve generations') }]} onChange={value => onChange(value as ApprovalMode)} />
}
export function VeniceSessionApprovals({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation(); const mode = useSessionApprovalMode(sessionId)
  return <Stack gap="xs"><ApprovalModeSelect value={mode} onChange={value => sessionApprovals.setMode(sessionId, value)} /><Text size="xs" c="dimmed">{t('Similar means the same tool, model and generation settings; the prompt may change. Automatic approval can incur costs. Deletions still ask for confirmation.')}</Text><Button size="xs" variant="subtle" onClick={() => sessionApprovals.clear(sessionId)}>{t('Reset approvals for this chat')}</Button></Stack>
}
