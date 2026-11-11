function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
const index = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Some compatible gateways emit type:"" for later argument fragments. Accept
 * that redundant empty field only after a complete header for this exact call.
 * Do not repair a new call, changed identity or malformed arguments. */
export function createToolDeltaNormalizer(): (payload: unknown) => boolean {
  const headers = new Map<number, Set<number>>()
  return payload => {
    if (!object(payload) || !Array.isArray(payload.choices)) return false
    let changed = false
    for (const choice of payload.choices) {
      if (!object(choice) || !index(choice.index ?? 0)) continue
      const choiceId = (choice.index ?? 0) as number
      const calls = object(choice.delta) && Array.isArray(choice.delta.tool_calls) ? choice.delta.tool_calls : []
      for (const call of calls) {
        if (!object(call) || !index(call.index) || !object(call.function)) continue
        const known = headers.get(choiceId)
        if (call.type === 'function' && typeof call.id === 'string' && call.id && typeof call.function.name === 'string' && call.function.name) {
          if (known) known.add(call.index)
          else headers.set(choiceId, new Set([call.index]))
          continue
        }
        const emptyIdentity = (call.id == null || call.id === '') && (call.function.name == null || call.function.name === '')
        if (call.type === '' && emptyIdentity && typeof call.function.arguments === 'string' && known?.has(call.index)) {
          delete call.type
          changed = true
        } else if (!emptyIdentity || (call.type != null && call.type !== 'function')) known?.delete(call.index)
      }
      if (choice.finish_reason != null) headers.delete(choiceId)
    }
    return changed
  }
}
