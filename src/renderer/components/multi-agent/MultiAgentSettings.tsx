import { Alert, Button, MultiSelect, NumberInput, Stack, Switch, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MultiAgentPolicySchema, type DedicatedAgent, type MultiAgentPolicy } from '@shared/multi-agent'
import type { SessionSettings } from '@shared/types'
import { forkT as ft } from '@/i18n/fork'
import { listDedicatedAgents } from '@/packages/multi-agent/library'

export function MultiAgentSettings({ value, onChange }: { value: SessionSettings['multiAgent']; onChange: (value: MultiAgentPolicy) => void }) {
  useTranslation(); const policy = MultiAgentPolicySchema.parse(value || {}), [agents, setAgents] = useState<DedicatedAgent[]>([]), [error, setError] = useState('')
  useEffect(() => { void listDedicatedAgents().then(setAgents).catch(error => setError(error.message)) }, [])
  const data = agents.map(agent => ({ value: agent.id, label: '@' + agent.name + ' · ' + agent.title }))
  return <Stack gap="sm">
    {error && <Alert color="red">{ft(error)}</Alert>}
    <Switch label={ft('Enable multi-agent work')} checked={policy.enabled} onChange={event => onChange({ ...policy, enabled: event.currentTarget.checked })}/>
    <Text size="xs" c="dimmed">{ft('Maximum three child levels. Each worker and guardian uses its selected provider and quota. A dedicated worker does not inherit the chat history, global memory or real filesystem access.')}</Text>
    <Switch label={ft('Allow on-demand agents with this model')} checked={policy.allowOnDemand} onChange={event => onChange({ ...policy, allowOnDemand: event.currentTarget.checked })}/>
    <NumberInput label={ft('Parallel worker limit')} min={1} max={4} value={policy.concurrency} onChange={value => typeof value === 'number' && onChange({ ...policy, concurrency: Math.min(4, Math.max(1, value)) })}/>
    <MultiSelect label={ft('Dedicated agents available to this chat')} data={data} value={policy.dedicatedIds} onChange={dedicatedIds => onChange({ ...policy, dedicatedIds, nestedDedicatedIds: policy.nestedDedicatedIds.filter(id => dedicatedIds.includes(id)) })} searchable comboboxProps={{ withinPortal: false }}/>
    <MultiSelect label={ft('Also allow these agents in nested calls')} data={data.filter(agent => policy.dedicatedIds.includes(agent.value))} value={policy.nestedDedicatedIds} onChange={nestedDedicatedIds => onChange({ ...policy, nestedDedicatedIds })} searchable comboboxProps={{ withinPortal: false }}/>
    <Text size="xs" c="dimmed">{ft('An explicit @name authorizes that dedicated agent for the current Work request. Nested permissions remain restricted by these settings.')}</Text>
    <Button variant="subtle" onClick={() => void import('./AgentLibrary').then(module => module.openAgentLibrary())}>{ft('Manage dedicated agents')}</Button>
  </Stack>
}
