export const BACKGROUND_LOCK_DELAY = 'background-lock-delay-seconds'
export function lockDelaySeconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(86400, Math.floor(value))) : 0
}

/** Check the elapsed time on resume as mobile operating systems can suspend timers. */
export function installBackgroundLock({ delaySeconds, lock, trackWindowFocus = true }: {
  delaySeconds: number; lock: () => void; trackWindowFocus?: boolean
}): () => void {
  let leftAt: number | undefined, expired = false, blurred = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const delay = lockDelaySeconds(delaySeconds) * 1000
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined }
  const expire = () => { clear(); if (!expired) { expired = true; lock() } }
  const leave = () => {
    if (leftAt !== undefined) return
    leftAt = Date.now(); expired = false
    if (!delay) expire()
    else timer = setTimeout(expire, delay)
  }
  const resume = () => {
    if (leftAt === undefined) return
    const elapsed = Date.now() - leftAt
    if (elapsed >= delay || elapsed < 0) expire()
    clear(); leftAt = undefined
  }
  const visibility = () => {
    if (document.visibilityState === 'hidden') leave()
    else { blurred = false; resume() }
  }
  const blur = () => { blurred = true; leave() }
  const focus = () => { blurred = false; if (document.visibilityState !== 'hidden') resume() }
  document.addEventListener('visibilitychange', visibility)
  if (trackWindowFocus) { window.addEventListener('blur', blur); window.addEventListener('focus', focus) }
  if (document.visibilityState === 'hidden' || blurred) leave()
  return () => {
    clear(); document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('blur', blur); window.removeEventListener('focus', focus)
  }
}
