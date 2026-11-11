import type { Message } from '../types'

/**
 * A message is eligible for AI context when it is complete (not generating)
 * and is not a UI-only fork marker.
 *
 * Compaction boundary selection must only pick messages that survive this
 * filter — otherwise context building cannot find the boundary and falls
 * back to full history. Keep every new exclusion here so both stay in sync.
 */
export function isContextEligibleMessage(message: Pick<Message, 'generating' | 'isForkMarker'>): boolean {
  return !message.generating && !message.isForkMarker
}

/** A continuation may include its own still-generating assistant target. Clone
 * only that trailing message for context; never alter the persisted/UI state. */
export function selectMessagesBeforeTarget(messages: Message[], targetIndex: number, preserveToolExchange = false): Message[] {
  const selected = messages.slice(0, targetIndex)
  const last = selected.at(-1)
  if (!preserveToolExchange || last?.role !== 'assistant' || !last.generating) return selected
  return [...selected.slice(0, -1), { ...last, generating: false }]
}
