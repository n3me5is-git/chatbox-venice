import { ActionIcon, Menu, Text } from '@mantine/core'
import { IconAt } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DedicatedAgent } from '@shared/multi-agent'
import { listDedicatedAgents } from '@/packages/multi-agent/library'
import { forkT as ft } from '@/i18n/fork'
export function AgentMentionButton({ onSelect }: { onSelect: (name: string) => void }) {
  useTranslation(); const [agents, setAgents] = useState<DedicatedAgent[]>([]), [error, setError] = useState('')
  return <Menu withinPortal={false} onOpen={() => { void listDedicatedAgents().then(setAgents).catch(error => setError(error.message)) }}><Menu.Target><ActionIcon size="lg" variant="subtle" title={ft('Tag a dedicated agent')} aria-label={ft('Tag a dedicated agent')}><IconAt size={19}/></ActionIcon></Menu.Target><Menu.Dropdown style={{ maxHeight: '45dvh', overflowY: 'auto' }}>{error && <Text size="xs" c="red">{error}</Text>}{agents.map(agent => <Menu.Item key={agent.id} onClick={() => onSelect(agent.name)}>@{agent.name} · {agent.title}</Menu.Item>)}<Menu.Item onClick={() => void import('./AgentLibrary').then(module => module.openAgentLibrary())}>{ft('Manage dedicated agents')}</Menu.Item></Menu.Dropdown></Menu>
}
