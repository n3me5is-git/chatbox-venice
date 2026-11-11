import { describe, expect, it } from 'vitest'
import { createToolDeltaNormalizer } from './openai-tool-delta'

const frame = (choice: number, call: number, header = false) => ({ choices: [{ index: choice, delta: { tool_calls: [{ index: call, type: header ? 'function' : '', id: header ? `id-${call}` : '', function: { name: header ? 'search' : '', arguments: header ? '' : '{"query":"test"}' } }] } }] })

describe('compatible tool argument continuations', () => {
  it('normalizes only known calls, separately for each choice and parallel call index', () => {
    const normalize = createToolDeltaNormalizer()
    expect(normalize(frame(0, 0))).toBe(false)
    normalize(frame(0, 0, true))
    normalize(frame(0, 1, true))
    expect(normalize(frame(1, 0))).toBe(false)
    expect(normalize(frame(0, 2))).toBe(false)
    for (const index of [0, 1]) {
      const continuation = frame(0, index)
      expect(normalize(continuation)).toBe(true)
      expect(continuation.choices[0].delta.tool_calls[0]).not.toHaveProperty('type')
    }
  })
  it('does not repair malformed identities, invalid arguments or a reused finished choice', () => {
    const normalize = createToolDeltaNormalizer()
    normalize(frame(0, 0, true))
    const changed = frame(0, 0)
    changed.choices[0].delta.tool_calls[0].id = 'different-call'
    expect(normalize(changed)).toBe(false)
    expect(normalize(frame(0, 0))).toBe(false)
    normalize(frame(0, 0, true))
    normalize({ choices: [{ index: 0, finish_reason: 'tool_calls' }] })
    expect(normalize(frame(0, 0))).toBe(false)
  })
})
