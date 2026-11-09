export interface AllowanceWindow {
  id: string
  group: string
  period: 'monthly' | 'weekly' | 'hours' | 'days' | 'account'
  duration?: number
  remaining: number
  resetsAt?: number
}
export interface ChatGPTAllowance { plan?: string; windows: AllowanceWindow[] }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const bounded = (value: string) => value.slice(0, 100)

/** The backend's primary/secondary names do not imply a billing period. */
export function parseChatGPTAllowance(value: unknown): ChatGPTAllowance {
  const payload = object(value), windows: AllowanceWindow[] = []
  const add = (raw: unknown, id: string, group: string) => {
    const item = object(raw), used = number(item.used_percent), duration = number(item.limit_window_seconds)
    if (used === undefined || duration === undefined || duration <= 0) return
    const resetsAt = number(item.reset_at)
    windows.push({ id, group, remaining: Math.max(0, Math.min(100, 100 - used)), duration,
      period: duration >= 28 * 86400 && duration <= 31 * 86400 ? 'monthly' : duration === 7 * 86400 ? 'weekly' : duration < 86400 ? 'hours' : 'days',
      ...(resetsAt !== undefined && resetsAt > 0 ? { resetsAt: resetsAt * 1000 } : {}) })
  }
  const group = (raw: unknown, id: string, name: string) => {
    const limit = object(raw)
    add(limit.primary_window, id + ':primary', name)
    add(limit.secondary_window, id + ':secondary', name)
  }
  group(payload.rate_limit, 'codex', 'ChatGPT')
  if (Array.isArray(payload.additional_rate_limits)) for (const [index, raw] of payload.additional_rate_limits.slice(0, 20).entries()) {
    const item = object(raw), name = typeof item.limit_name === 'string' ? bounded(item.limit_name) : 'ChatGPT'
    group(item.rate_limit, 'additional:' + index, name)
  }
  // A spending cap has no period in this schema. Never label it monthly by inference.
  const cap = object(object(payload.spend_control).individual_limit), remaining = number(cap.remaining_percent), reset = number(cap.reset_at)
  if (remaining !== undefined) windows.push({ id: 'account', group: 'ChatGPT', period: 'account', remaining: Math.max(0, Math.min(100, remaining)), ...(reset !== undefined && reset > 0 ? { resetsAt: reset * 1000 } : {}) })
  if (!windows.length) throw Error('ChatGPT did not report an allowance for this account')
  return { plan: typeof payload.plan_type === 'string' ? bounded(payload.plan_type) : undefined, windows }
}
