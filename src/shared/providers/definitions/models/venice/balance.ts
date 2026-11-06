/** Inference keys can read rate limits; billing/balance requires an ADMIN key. */
export function parseVeniceBalance(input: unknown): { USD?: number; DIEM?: number } {
  const object = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const data = object.data && typeof object.data === 'object' ? object.data as Record<string, unknown> : object
  const balances = data.balances && typeof data.balances === 'object' ? data.balances as Record<string, unknown> : {}
  const result: { USD?: number; DIEM?: number } = {}
  for (const currency of ['USD', 'DIEM'] as const) {
    const value = balances[currency] ?? balances[currency.toLowerCase()]
    if ((typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value))) result[currency] = Number(value)
  }
  if (!Object.keys(result).length) throw new Error('The Venice API did not return balance amounts')
  return result
}
