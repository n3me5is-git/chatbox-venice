import type { MediaRecord } from './media'
export interface MediaWaitResult { record: MediaRecord; timedOut: boolean }
/** Observe an existing job. Never submit, restart or retrieve a paid provider job here. */
export function waitForMediaRecord(source: { read(): Promise<MediaRecord | null>; subscribe(listener: () => void): () => void }, timeoutMs = 30000, signal?: AbortSignal): Promise<MediaWaitResult> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 60000) return Promise.reject(new Error('Wait duration must be between 0 and 60 seconds'))
  if (signal?.aborted) return Promise.reject(signal.reason || new Error('Wait cancelled'))
  return new Promise((resolve, reject) => {
    let settled = false, reading = false, again = false, expired = timeoutMs === 0
    let unsubscribe = () => {}, timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => { if (timer !== undefined) clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', abort) }
    const fail = (error: unknown) => { if (!settled) { settled = true; cleanup(); reject(error) } }
    const abort = () => fail(signal?.reason || new Error('Wait cancelled'))
    const refresh = async () => {
      if (settled) return
      if (reading) { again = true; return }
      reading = true
      try {
        const record = await source.read()
        if (settled) return
        if (!record) throw new Error('This generation is no longer available')
        if (record.protectedRecord) throw new Error('Unlock this creation before checking its status')
        const terminal = ['ready', 'error', 'paused'].includes(record.status)
        if (terminal || expired) { settled = true; cleanup(); resolve({ record, timedOut: !terminal && expired }) }
      } catch (error) { fail(error) }
      finally { reading = false; if (again && !settled) { again = false; void refresh() } }
    }
    unsubscribe = source.subscribe(() => void refresh())
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    timer = setTimeout(() => { expired = true; void refresh() }, timeoutMs)
    void refresh()
  })
}
