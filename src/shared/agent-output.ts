import type { Message } from './types'

/** A follow-up replaces the answer; it must not repeat all previous tasks' text. */
export function latestAgentOutput(messages: Message[]): string {
  const message = messages.filter(message => message.role === 'assistant').at(-1)
  if (!message) return ''
  const lastTool = message.contentParts.findLastIndex(part => part.type === 'tool-call')
  return message.contentParts.slice(lastTool + 1).filter(part => part.type === 'text' && !part.protocolOnly).map(part => part.text).join('\n')
}

/** Coalesce slow encrypted writes: at most one in flight and one latest snapshot. */
export function latestSnapshotWriter<T>(write: (value: T) => Promise<unknown>) {
  let pending: { value: T } | undefined, running: Promise<void> | undefined, failure: unknown
  const drain = async () => {
    while (pending) { const { value } = pending; pending = undefined; await write(value) }
  }
  const start = () => {
    if (running || !pending || failure) return
    running = drain().catch(error => { failure = error }).finally(() => { running = undefined; start() })
  }
  return {
    push(value: T) {
      if (failure) return
      pending = { value }
      start()
    },
    async flush() { while (running) await running; if (failure) throw failure },
  }
}
