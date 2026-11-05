import { useSyncExternalStore, useId, useRef } from 'react'
import { Button, Radio, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { sessionApprovals, type ApprovalMode } from '@/packages/venice/session-approvals'
export function useSessionApprovalMode(sessionId: string) {
  useSyncExternalStore(sessionApprovals.subscribe, sessionApprovals.snapshot, sessionApprovals.snapshot)
  return sessionApprovals.mode(sessionId)
}
export function ApprovalModeOptions({ value, onChange }: { value: ApprovalMode; onChange: (mode: ApprovalMode) => void }) {
  const { t } = useTranslation(); const name=useId()
  const touch = useRef<{id:number;x:number;y:number}|null>(null)
  return <div data-vaul-no-drag onPointerDownCapture={event => { touch.current = event.pointerType === 'touch' ? {id:event.pointerId,x:event.clientX,y:event.clientY} : null }} onPointerCancel={() => { touch.current = null }} onPointerUpCapture={event => {
    const start=touch.current;touch.current=null
    if(!start || start.id!==event.pointerId || Math.hypot(event.clientX-start.x,event.clientY-start.y)>8) return
    const label=(event.target as HTMLElement).closest('label');const input=label?.htmlFor ? document.getElementById(label.htmlFor) as HTMLInputElement|null : null
    if(input && event.currentTarget.contains(input) && ['ask','similar','automatic'].includes(input.value)) { event.preventDefault();onChange(input.value as ApprovalMode) }
  }}><Radio.Group name={name} label={t('Generation approval for this chat')} description={t('Applies to Venice image, voice, video and music tools until the app closes.')} value={value} onChange={value => onChange(value as ApprovalMode)}><Stack gap="sm" mt="xs"><Radio value="ask" label={t('Ask every time')} /><Radio value="similar" label={t('Remember similar generations after approval')} /><Radio value="automatic" label={t('Automatically approve generations')} /></Stack></Radio.Group></div>
}
export function VeniceSessionApprovals({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation(); const mode = useSessionApprovalMode(sessionId)
  return <Stack gap="xs"><ApprovalModeOptions value={mode} onChange={value => sessionApprovals.setMode(sessionId, value)} /><Text size="xs" c="dimmed">{t('Similar means the same tool, model and generation settings; the prompt may change. Automatic approval can incur costs. Deletions still ask for confirmation.')}</Text><Button size="xs" variant="subtle" onClick={() => sessionApprovals.clear(sessionId)}>{t('Reset approvals for this chat')}</Button></Stack>
}
