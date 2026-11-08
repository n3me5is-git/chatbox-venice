interface Action { send(data: unknown, options?: { target?: string }): Promise<unknown>; onMessage: (data: any, context: { peerId: string }) => void }
interface Room { makeAction(name: string): Action; onPeerJoin: (peerId: string) => void; onPeerLeave: (peerId: string) => void; leave(): Promise<void> }
export function joinRoom(config: Record<string, unknown>, room: string, callbacks?: Record<string, unknown>): Room
export const defaultRelayUrls: string[]
