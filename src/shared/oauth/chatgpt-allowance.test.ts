import { describe, expect, it } from 'vitest'
import { parseChatGPTAllowance } from './chatgpt-allowance'
const window = (seconds: number, used = 25) => ({ used_percent: used, limit_window_seconds: seconds, reset_at: 1800000000 })
describe('ChatGPT reported allowance windows', () => {
  it('shows monthly and optional weekly percentages as remaining, including exhausted balances', () => {
    const result = parseChatGPTAllowance({ plan_type: 'pro', rate_limit: { primary_window: window(30 * 86400), secondary_window: window(7 * 86400, 100) } })
    expect(result.windows.map(item => [item.period, item.remaining])).toEqual([['monthly', 75], ['weekly', 0]])
    expect(result.windows[0].resetsAt).toBe(1800000000000)
    expect(parseChatGPTAllowance({ rate_limit: { primary_window: window(28 * 86400), secondary_window: null } }).windows).toHaveLength(1)
  })
  it('does not rename a five-hour limit or spending cap to a monthly subscription allowance', () => {
    expect(parseChatGPTAllowance({ rate_limit: { primary_window: window(18000) } }).windows[0]).toMatchObject({ period: 'hours', duration: 18000, remaining: 75 })
    expect(parseChatGPTAllowance({ spend_control: { individual_limit: { remaining_percent: 42 } } }).windows[0]).toMatchObject({ period: 'account', remaining: 42 })
  })
  it('reads separate model allowances, clamps overages, and rejects missing or malformed amounts', () => {
    expect(parseChatGPTAllowance({ additional_rate_limits: [{ limit_name: 'Other model', rate_limit: { primary_window: window(86400, 103) } }] }).windows[0]).toMatchObject({ group: 'Other model', remaining: 0, period: 'days' })
    for (const raw of [null, {}, { rate_limit: { primary_window: { used_percent: null, limit_window_seconds: 2592000 } } }]) expect(() => parseChatGPTAllowance(raw)).toThrow('did not report')
  })
})
