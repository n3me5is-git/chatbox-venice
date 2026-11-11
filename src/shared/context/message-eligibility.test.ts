import { describe, expect, it } from 'vitest'
import type { Message } from '../types'
import { isContextEligibleMessage, selectMessagesBeforeTarget } from './message-eligibility'

describe('resumed tool context', () => {
  const user: Message = { id: 'user', role: 'user', contentParts: [{ type: 'text', text: 'Search' }] }
  const reply: Message = { id: 'reply', role: 'assistant', generating: true, contentParts: [{ type: 'tool-call', toolCallId: 'search-1', toolName: 'search', state: 'result', args: { query: 'hello' }, result: { found: true } }] }
  it('keeps completed exchanges when explicitly resuming, without mutating the UI message', () => {
    const messages = [user, reply]
    const selected = selectMessagesBeforeTarget(messages, 2, true)
    expect(selected[0]).toBe(user)
    expect(selected[1]).toEqual({ ...reply, generating: false })
    expect(selected[1].contentParts).toBe(reply.contentParts)
    expect(reply.generating).toBe(true)
    expect(isContextEligibleMessage(selected[1])).toBe(true)
  })
  it('keeps ordinary in-flight replies excluded and never includes messages after the target', () => {
    expect(selectMessagesBeforeTarget([user, reply], 1, true)).toEqual([user])
    expect(isContextEligibleMessage(selectMessagesBeforeTarget([user, reply], 2)[1])).toBe(false)
    expect(selectMessagesBeforeTarget([], 0, true)).toEqual([])
    expect(selectMessagesBeforeTarget([{ ...user, generating: true }], 1, true)[0].generating).toBe(true)
  })
})
