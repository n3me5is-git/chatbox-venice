import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Badge, Button, Group, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentRun } from '@shared/multi-agent'
import { rendererApplication } from '@/app/renderer-application'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { SessionResources } from '@/components/session-resources/SessionResources'
import { forkT as ft } from '@/i18n/fork'
import { multiAgentRuntime, loadAgentRuns, agentTranscript, agentEvents } from '@/packages/multi-agent/runtime'
import { MultiAgentSettings } from './MultiAgentSettings'

export const MultiAgentPanel = NiceModal.create(({ sessionId }: { sessionId: string }) => {
  useTranslation(); const modal = useModal(), { session } = rendererApplication.sessionHooks.useSessionHeader(sessionId)
  const [, setRevision] = useState(0), [selected, setSelected] = useState<AgentRun>(), [tab, setTab] = useState<'chat' | 'files' | 'resources'>('chat'), [transcript, setTranscript] = useState(''), [error, setError] = useState('')
  useEffect(() => { void loadAgentRuns(sessionId).catch(error => setError(error.message)); return multiAgentRuntime.subscribe(() => setRevision(value => value + 1)) }, [sessionId])
  const runs = [...multiAgentRuntime.runs.values()].filter(run => run.rootId === sessionId)
  useEffect(() => { if (!selected || tab !== 'chat') return; let active = true; const load = () => void agentTranscript(selected.sessionId).then(messages => { if (active) setTranscript(messages.map(message => message.role.toUpperCase() + '\n' + message.contentParts.map(part => part.type === 'text' ? part.text : part.type === 'tool-call' ? '[' + part.toolName + ': ' + part.state + ']' : '').join('')).join('\n\n')) }).catch(error => active && setError(error.message)); load(); const timer = setInterval(load, 1500); return () => { active = false; clearInterval(timer) } }, [selected?.id, tab])
  return <AdaptiveModal opened={modal.visible} onClose={() => modal.remove()} title={ft('Multi-agent work')} size="xl"><Stack gap="sm" style={{ height: '78dvh', minHeight: 0 }}>
    {error && <Alert color="red">{ft(error)}</Alert>}
    {selected ? <>
      <Button variant="subtle" onClick={() => setSelected(undefined)}>{ft('Back to agent tree')}</Button><Text fw={600}>{selected.title} · {ft(selected.status)}</Text>
      <Group gap="xs"><Button size="xs" variant={tab === 'chat' ? 'filled' : 'default'} onClick={() => setTab('chat')}>{ft('Conversation')}</Button><Button size="xs" variant={tab === 'files' ? 'filled' : 'default'} onClick={() => setTab('files')}>{ft('Workspace files')}</Button>{selected.workspaceId !== selected.sessionId && <Button size="xs" variant={tab === 'resources' ? 'filled' : 'default'} onClick={() => setTab('resources')}>{ft('Generated resources')}</Button>}</Group>
      {selected.error && <Alert color="red">{ft(selected.error)}</Alert>}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>{tab === 'chat' ? <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>{transcript}</pre> : <SessionResources sessionId={tab === 'files' ? selected.workspaceId : selected.sessionId} restricted/>}</div>
    </> : <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
      <details><summary>{ft('Multi-agent settings')}</summary>{session && <MultiAgentSettings value={session.settings?.multiAgent} onChange={value => { void rendererApplication.sessions.updateSessionHeader(sessionId, header => { if (!header) throw Error('Chat is unavailable'); return { ...header, settings: { ...header.settings, multiAgent: value } } }).catch(error => setError(error.message)) }}/>}</details>
      <Group justify="space-between" my="sm"><Text size="sm">{ft('Agent tree')}</Text><Button size="xs" color="red" variant="light" onClick={() => void multiAgentRuntime.stopRoot(sessionId).catch(error => setError(error.message))}>{ft('Stop all agents')}</Button></Group>
      {!runs.length && <Text p="sm" c="dimmed">{ft('No child agents yet. Enable multi-agent work or ask explicitly to use multiple agents.')}</Text>}
      {runs.sort((a, b) => a.createdAt - b.createdAt).map(run => <Group key={run.id} justify="space-between" p="xs" ml={(run.depth - 1) * 14} style={{ borderLeft: '2px solid var(--chatbox-border-primary)' }}><Stack gap={2} style={{ minWidth: 0, flex: 1 }}><Text fw={500}>{run.title}</Text><Text size="xs" c="dimmed">{run.preset ? '@' + run.preset.name : ft('On-demand agent')} · {run.model.modelId} · {ft('Depth')} {run.depth}/3</Text><Group gap={4}><Badge variant="light">{ft(run.status)}</Badge><Badge variant="outline">{ft(run.kind === 'dedicated' ? 'Isolated workspace' : 'Shared workspace')}</Badge></Group></Stack><Button size="xs" variant="default" onClick={() => { setSelected(run); setTab('chat') }}>{ft('Inspect')}</Button>{['queued', 'running', 'waiting'].includes(run.status) && <Button size="xs" color="red" variant="subtle" onClick={() => void multiAgentRuntime.cancelTree(run.id)}>{ft('Stop')}</Button>}</Group>)}
      {(agentEvents.get(sessionId) || []).slice().reverse().map((event, index) => <Alert key={index} color="yellow" mt="xs" title={ft('Guardian blocked a transfer')}><Text size="xs">{event.operation} · {new Date(event.at).toLocaleTimeString()}</Text>{event.reason}</Alert>)}
    </div>}
  </Stack></AdaptiveModal>
})
