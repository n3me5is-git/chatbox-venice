/** In-memory leases distinguish live snapshots from encrypted candidates left by a crash. */
export const activeTransferSnapshots = new Set<string>()
const leases = new Map<string, () => void>()
const knownTransfers = new Set<string>()
const manager = () => typeof navigator !== 'undefined' ? navigator.locks : undefined
/** Web Locks keep another app window's live snapshots/imports out of recovery. */
export async function holdTransferLease(job: string) {
  if (leases.has(job)) throw Error('This transfer is already active')
  const locks = manager()
  if (!locks) { leases.set(job, () => {}); knownTransfers.add(job); return }
  await new Promise<void>((resolve, reject) => {
    void locks.request('chatbox-direct-transfer:' + job, { ifAvailable: true }, lock => {
      if (!lock) { reject(Error('This transfer is already active')); return }
      return new Promise<void>(release => { leases.set(job, release); knownTransfers.add(job); resolve() })
    }).catch(reject)
  })
}
export function releaseTransferLease(job: string) { leases.get(job)?.(); leases.delete(job) }
export function forgetTransferLease(job: string) { releaseTransferLease(job); knownTransfers.delete(job) }
export async function withIdleTransfer(job: string, work: () => Promise<void>, createdAt = 0) {
  if (leases.has(job)) return
  const locks = manager()
  if (locks) await locks.request('chatbox-direct-transfer:' + job, { ifAvailable: true }, async lock => { if (lock) await work() })
  // Old engines cannot distinguish another live window. Defer automatic deletion.
  else if (knownTransfers.has(job) || typeof window === 'undefined' || typeof navigator === 'undefined' || Date.now() - createdAt > 86400000) await work()
}
