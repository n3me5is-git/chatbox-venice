const balanceTypes = ['USD', 'DIEM', 'BUNDLED_CREDITS'] as const
type VeniceBalanceAmounts = Partial<Record<(typeof balanceTypes)[number], number>>

/** Balances from the rate-limits endpoint are available to inference keys. */
export function parseVeniceBalance(input: unknown): VeniceBalanceAmounts {
  const object = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const data = object.data && typeof object.data === 'object' ? object.data as Record<string, unknown> : object
  const balances = data.balances && typeof data.balances === 'object' ? data.balances as Record<string, unknown> : {}
  const result: VeniceBalanceAmounts = {}
  for (const currency of balanceTypes) {
    const value = balances[currency] ?? balances[currency.toLowerCase()]
    if ((typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value))) result[currency] = Number(value)
  }
  if (!Object.keys(result).length) throw new Error('The Venice API did not return balance amounts')
  return result
}
