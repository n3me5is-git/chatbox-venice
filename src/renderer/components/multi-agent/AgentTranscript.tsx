import { Alert, Badge, Group, Paper, Stack, Text } from '@mantine/core'
import type { AgentMetrics } from '@shared/multi-agent'
import type { Message } from '@shared/types'
import { useTranslation } from 'react-i18next'
import Markdown from '@/components/Markdown'
import { StepTimelineUI } from '@/components/message-parts/StepTimelineUI'
import { forkT as ft } from '@/i18n/fork'

export function AgentTranscript({ messages, sessionId }: { messages: Message[]; sessionId: string }) {
  useTranslation()
  return <Stack gap="sm" data-agent-transcript>
    {messages.map(message => <Paper key={message.id} p="sm" withBorder radius="md" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Group gap="xs" mb="xs"><Badge variant="light">{ft(message.role === 'assistant' ? 'Agent' : message.role === 'user' ? 'Caller' : 'Instructions')}</Badge>{message.generating && <Text size="xs" c="dimmed">{ft('running')}</Text>}</Group>
      {message.contentParts.map((part, index) => part.type === 'text' && !part.protocolOnly ? <Markdown key={index} sessionId={sessionId} uniqueId={message.id + '-' + index} hiddenCodeActions>{part.text}</Markdown> : part.type === 'reasoning' || part.type === 'tool-call' ? <StepTimelineUI key={index} parts={[part]} message={message} sessionId={sessionId} messageId={message.id}/> : null)}
      {message.error && <Alert color="red">{message.error}</Alert>}
    </Paper>)}
  </Stack>
}

export function AgentPerformance({ metrics }: { metrics: AgentMetrics }) {
  useTranslation()
  const seconds = (ms: number) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' s'
  return <details><summary>{ft('Agent performance')}</summary><Stack gap={3} p="xs">
    <Text size="xs">{ft('Queue')}: {seconds(metrics.queueMs)} · {ft('Model requests')}: {metrics.steps}</Text>
    {metrics.firstTokenMs !== undefined && <Text size="xs">{ft('First token')}: {seconds(metrics.firstTokenMs)}</Text>}
    <Text size="xs">{ft('Generation')}: {seconds(metrics.generationMs)} · {ft('Tools and waiting')}: {seconds(metrics.toolMs)} · {ft('Output tokens')}: {metrics.outputTokens.toLocaleString()}</Text>
    <Text size="xs">{ft('Generation speed')}: {metrics.tokensPerSecond === undefined ? ft('Unavailable for buffered responses') : metrics.tokensPerSecond.toLocaleString() + ' token/s'}</Text>
    <Text size="xs" c="dimmed">{ft('Token speed uses provider output tokens and observed generation time, excluding queue and tool waits. Encrypted buffered responses cannot provide a reliable decoding speed.')}</Text>
  </Stack></details>
}
