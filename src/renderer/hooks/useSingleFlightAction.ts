import { useCallback, useRef, useState } from 'react'

/** Claim synchronously, before React can paint or a session runtime is created. */
export function useSingleFlightAction() {
  const active = useRef(false)
  const [pending, setPending] = useState(false)
  const run = useCallback(async (action: () => Promise<void>) => {
    if (active.current) return
    active.current = true
    setPending(true)
    try { await action() }
    finally { active.current = false; setPending(false) }
  }, [])
  return { pending, run }
}
