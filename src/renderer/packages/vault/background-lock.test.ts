// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installBackgroundLock, lockDelaySeconds } from './background-lock'
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
describe('background app lock grace period', () => {
  it('keeps immediate locking as the default and bounds corrupt settings', () => {
    expect(lockDelaySeconds(undefined)).toBe(0); expect(lockDelaySeconds(NaN)).toBe(0)
    expect(lockDelaySeconds(-1)).toBe(0); expect(lockDelaySeconds(100000)).toBe(86400)
    const lock=vi.fn(),stop=installBackgroundLock({delaySeconds:0,lock})
    try { window.dispatchEvent(new Event('blur')); expect(lock).toHaveBeenCalledOnce() } finally { stop() }
  })
  it('cancels on a quick return and restarts the full delay on the next departure', () => {
    vi.useFakeTimers(); const lock=vi.fn(),stop=installBackgroundLock({delaySeconds:30,lock})
    try {
      window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(20000)
      window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(40000)
      expect(lock).not.toHaveBeenCalled()
      window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(29999); expect(lock).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1); expect(lock).toHaveBeenCalledOnce()
      window.dispatchEvent(new Event('focus')); expect(lock).toHaveBeenCalledOnce()
    } finally { stop() }
  })
  it('locks on Android resume after timers have been suspended, without window blur from native dialogs', () => {
    vi.useFakeTimers(); let hidden=false
    vi.spyOn(document,'visibilityState','get').mockImplementation(()=>hidden?'hidden':'visible')
    const lock=vi.fn(),stop=installBackgroundLock({delaySeconds:60,lock,trackWindowFocus:false})
    try {
      window.dispatchEvent(new Event('blur')); vi.advanceTimersByTime(120000); expect(lock).not.toHaveBeenCalled()
      hidden=true; document.dispatchEvent(new Event('visibilitychange'))
      vi.setSystemTime(Date.now()+61000) // The OS did not run the timeout callback.
      hidden=false; document.dispatchEvent(new Event('visibilitychange')); expect(lock).toHaveBeenCalledOnce()
    } finally { stop() }
  })
  it('removes pending timers and listeners when the setting is disabled or changes', () => {
    vi.useFakeTimers(); const lock=vi.fn(),stop=installBackgroundLock({delaySeconds:5,lock})
    window.dispatchEvent(new Event('blur')); stop(); vi.advanceTimersByTime(6000)
    window.dispatchEvent(new Event('blur')); expect(lock).not.toHaveBeenCalled()
  })
})
