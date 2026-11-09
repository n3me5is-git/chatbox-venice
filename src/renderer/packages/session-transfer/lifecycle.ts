/** In-memory leases distinguish live snapshots from encrypted candidates left by a crash. */
export const activeTransferSnapshots = new Set<string>()
