import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Badge, Button, Group, Stack, Text, Textarea } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentRun } from '@shared/multi-agent'
import type { Message } from '@shared/types'
import { rendererApplication } from '@/app/renderer-application'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { SessionResources } from '@/components/session-resources/SessionResources'
import { forkT as ft } from '@/i18n/fork'
import { multiAgentRuntime, loadAgentRuns, agentTranscript, agentEvents, sendAgentFollowUp } from '@/packages/multi-agent/runtime'
import { MultiAgentSettings } from './MultiAgentSettings'
import { AgentTranscript, AgentPerformance } from './AgentTranscript'

export const MultiAgentPanel = NiceModal.create(({ sessionId }: { sessionId: string }) => {
  useTranslation(); const modal = useModal(), { session } = rendererApplication.sessionHooks.useSessionHeader(sessionId)
  const [, setRevision] = useState(0), [selectedId, setSelectedId] = useState<string>(), [tab, setTab] = useState<'chat' | 'files' | 'resources'>('chat'), [transcript, setTranscript] = useState<Message[]>([]), [error, setError] = useState(''), [followUp, setFollowUp] = useState(''), [sending, setSending] = useState(false)
  const selected: AgentRun | undefined = selectedId ? multiAgentRuntime.runs.get(selectedId) : undefined
  useEffect(() => { void loadAgentRuns(sessionId).catch(error => setError(error.message)); return multiAgentRuntime.subscribe(() => setRevision(value => value + 1)) }, [sessionId])
  const runs = [...multiAgentRuntime.runs.values()].filter(run => run.rootId === sessionId)
  useEffect(() => { setTranscript([]); if (!selected || tab !== 'chat') return; let active = true, loading = false; const load = async () => { if (loading) return; loading = true; try { const messages = await agentTranscript(selected.sessionId); if (active) setTranscript(messages) } catch (error) { if (active) setError((error as Error).message) } finally { loading = false } }; void load(); const timer = setInterval(() => void load(), 1500); return () => { active = false; clearInterval(timer) } }, [selected?.id, tab])
  return <AdaptiveModal opened={modal.visible} onClose={() => modal.remove()} title={ft('Multi-agent work')} size="xl"><Stack gap="sm" style={{ height: '78dvh', minHeight: 0 }}>
    {error && <Alert color="red">{ft(error)}</Alert>}
    {selected ? <>
      <Button variant="subtle" onClick={() => { setSelectedId(undefined); setFollowUp('') }}>{ft('Back to agent tree')}</Button><Text fw={600}>{selected.title} · {ft(selected.status)}</Text>
      <Group gap="xs"><Button size="xs" variant={tab === 'chat' ? 'filled' : 'default'} onClick={() => setTab('chat')}>{ft('Conversation')}</Button><Button size="xs" variant={tab === 'files' ? 'filled' : 'default'} onClick={() => setTab('files')}>{ft('Workspace files')}</Button>{selected.workspaceId !== selected.sessionId && <Button size="xs" variant={tab === 'resources' ? 'filled' : 'default'} onClick={() => setTab('resources')}>{ft('Generated resources')}</Button>}</Group>
      {selected.error && <Alert color="red">{ft(selected.error)}</Alert>}
      {selected.metrics && <AgentPerformance metrics={selected.metrics}/>}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>{tab === 'chat' ? <AgentTranscript messages={transcript} sessionId={selected.sessionId}/> : <SessionResources sessionId={tab === 'files' ? selected.workspaceId : selected.sessionId} restricted/>}</div>
      <Textarea autosize minRows={1} maxRows={4} label={ft('Follow-up or steering')} placeholder={ft('Continue this agent without restarting its task')} value={followUp} onChange={event => setFollowUp(event.currentTarget.value)} maxLength={100000}/>
      <Group justify="space-between"><Text size="xs" c="dimmed">{ft('Running agents receive this at the next model step. Finished agents resume the same conversation and files.')}</Text><Button size="xs" loading={sending} disabled={!followUp.trim()} onClick={() => { setSending(true); setError(''); void sendAgentFollowUp(sessionId, selected.id, followUp).then(() => setFollowUp('')).catch(error => setError(error.message)).finally(() => setSending(false)) }}>{ft(['queued','running','waiting'].includes(selected.status) ? 'Send steering' : 'Resume agent')}</Button></Group>
    </> : <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
      <details><summary>{ft('Multi-agent settings')}</summary>{session && <MultiAgentSettings value={session.settings?.multiAgent} onChange={value => { void rendererApplication.sessions.updateSessionHeader(sessionId, header => { if (!header) throw Error('Chat is unavailable'); return { ...header, settings: { ...header.settings, multiAgent: value } } }).catch(error => setError(error.message)) }}/>}</details>
      <Group justify="space-between" my="sm"><Text size="sm">{ft('Agent tree')}</Text><Button size="xs" color="red" variant="light" onClick={() => void multiAgentRuntime.stopRoot(sessionId).catch(error => setError(error.message))}>{ft('Stop all agents')}</Button></Group>
      {!runs.length && <Text p="sm" c="dimmed">{ft('No child agents yet. Enable multi-agent work or ask explicitly to use multiple agents.')}</Text>}
      {runs.sort((a, b) => a.createdAt - b.createdAt).map(run => <Group key={run.id} justify="space-between" p="xs" ml={(run.depth - 1) * 14} style={{ borderLeft: '2px solid var(--chatbox-border-primary)' }}><Stack gap={2} style={{ minWidth: 0, flex: 1 }}><Text fw={500}>{run.title}</Text><Text size="xs" c="dimmed">{run.preset ? '@' + run.preset.name : ft('On-demand agent')} · {run.model.modelId} · {ft('Depth')} {run.depth}/3</Text><Group gap={4}><Badge variant="light">{ft(run.status)}</Badge><Badge variant="outline">{ft(run.kind === 'dedicated' ? 'Isolated workspace' : 'Shared workspace')}</Badge></Group></Stack><Button size="xs" variant="default" onClick={() => { setSelectedId(run.id); setFollowUp(''); setTab('chat') }}>{ft('Inspect')}</Button>{['queued', 'running', 'waiting'].includes(run.status) && <Button size="xs" color="red" variant="subtle" onClick={() => void multiAgentRuntime.cancelTree(run.id)}>{ft('Stop')}</Button>}</Group>)}
      {(agentEvents.get(sessionId) || []).slice().reverse().map((event, index) => <Alert key={index} color="yellow" mt="xs" title={ft('Guardian blocked a transfer')}><Text size="xs">{event.operation} · {new Date(event.at).toLocaleTimeString()}</Text>{event.reason}</Alert>)}
    </div>}
  </Stack></AdaptiveModal>
})
