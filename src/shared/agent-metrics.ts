import type { AgentMetrics } from './multi-agent'
import type { MessageContentParts } from './types'

/** No token pacing. Measure provider response time separately from tool/queue time. */
export function agentMetrics(queueMs: number, now: () => number = () => performance.now()) {
  const value: AgentMetrics = { queueMs, generationMs: 0, toolMs: 0, outputTokens: 0, steps: 0 }
  let started: number | undefined, first: number | undefined, last: number | undefined, tool: number | undefined, textSize = 0
  const toolIds = new Set<string>()
  return {
    request() { started = now(); first = last = tool = undefined; value.steps++ },
    delta(parts: MessageContentParts) {
      const size = parts.reduce((size, part) => size + ((part.type === 'text' || part.type === 'reasoning') ? part.text.length : 0), 0)
      if (size > textSize && started !== undefined) {
        last = now(); first ??= last; value.firstTokenMs ??= first - started
      }
      textSize = size
      for (const part of parts) if (part.type === 'tool-call' && !toolIds.has(part.toolCallId)) { toolIds.add(part.toolCallId); if (started !== undefined) tool ??= now() }
    },
    step(usage?: { outputTokens?: number }) {
      if (started === undefined) return
      const end = now(), responseEnd = tool ?? last ?? end
      value.generationMs += Math.max(0, responseEnd - (first ?? started))
      value.toolMs += tool === undefined ? 0 : Math.max(0, end - tool)
      value.outputTokens += usage?.outputTokens ?? 0
      started = undefined
    },
    result(): AgentMetrics {
      // Buffered E2EE responses have no observable decoding interval. Never show
      // an implausible throughput calculated from replaying decrypted chunks.
      return { ...value, tokensPerSecond: value.generationMs >= 250 && value.outputTokens > 0 ? Math.round(value.outputTokens * 10000 / value.generationMs) / 10 : undefined }
    },
  }
}
