import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
it('never cleans another window’s live transfer and releases its lease after disposal', async () => {
  const held = new Set<string>()
  const locks = { async request(name: string, _options: unknown, callback: (lock: unknown) => unknown) {
    if (held.has(name)) return callback(null)
    held.add(name)
    try { return await callback({ name, mode: 'exclusive' }) } finally { held.delete(name) }
  } }
  vi.stubGlobal('navigator', { locks })
  const first = await import('./lifecycle'); vi.resetModules(); const otherWindow = await import('./lifecycle'), work = vi.fn(async () => {})
  await first.holdTransferLease('job')
  await otherWindow.withIdleTransfer('job', work); expect(work).not.toHaveBeenCalled()
  first.forgetTransferLease('job'); await vi.waitFor(() => expect(held.size).toBe(0))
  await otherWindow.withIdleTransfer('job', work); expect(work).toHaveBeenCalledOnce()
})
