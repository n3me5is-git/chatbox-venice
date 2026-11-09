import { Stack, Switch, Textarea } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { DedicatedAgent } from '@shared/multi-agent'
import { forkT as ft } from '@/i18n/fork'
type CallingDetails = Pick<DedicatedAgent, 'description' | 'additionalDetails' | 'sharePromptWithCaller'>
export function AgentCallingDetails({ value: draft, onChange }: { value: CallingDetails; onChange: (change: Partial<CallingDetails>) => void }) {
  useTranslation()
  return <Stack gap="sm">
      <Textarea label={ft('Description')} value={draft.description} onChange={event => onChange({ description: event.currentTarget.value })} minRows={3} autosize maxRows={8} maxLength={4000}/>
      <Textarea label={ft('Additional details for callers')} description={ft('Explain when to use this agent, what to send, and the expected result. This is visible to permitted callers.')} value={draft.additionalDetails || ''} onChange={event => onChange({ additionalDetails: event.currentTarget.value })} minRows={3} autosize maxRows={12} maxLength={12000}/>
      <Switch label={ft('Share worker instructions with callers')} description={ft('Append the worker prompt to its caller-facing description. Off by default. The guardian policy stays private.')} checked={draft.sharePromptWithCaller === true} onChange={event => onChange({ sharePromptWithCaller: event.currentTarget.checked })}/>

  </Stack>
}
