import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
const locks = new Map<string, Promise<unknown>>()
export async function readAgentData<T>(key: string, fallback: T): Promise<T> {
  const vault = vaultRuntimeFor(platform), header = await vault.assets.header(key)
  if (!header) return fallback
  if (header.bytes > 8 * 1024 * 1024) throw Error('Agent metadata exceeds the local size limit')
  const bytes = new Uint8Array(header.bytes); let offset = 0
  try { for await (const chunk of vault.assets.read(key)) { bytes.set(chunk, offset); offset += chunk.length; chunk.fill(0) }; return JSON.parse(new TextDecoder().decode(bytes)) }
  finally { bytes.fill(0) }
}
export async function updateAgentData<T>(key: string, fallback: T, update: (current: T) => T, sessionId?: string): Promise<T> {
  const previous = locks.get(key) || Promise.resolve()
  const work = previous.catch(() => {}).then(async () => {
    const vault = vaultRuntimeFor(platform)
    if (sessionId) await vault.projects.assertSession(sessionId)
    if (!await vault.available()) throw Error('Device encryption is unavailable')
    const next = update(await readAgentData(key, fallback)), bytes = new TextEncoder().encode(JSON.stringify(next))
    if (bytes.length > 8 * 1024 * 1024) throw Error('Agent metadata exceeds the local size limit')
    const old = await vault.assets.header(key), scope = sessionId ? await vault.projects.sessionScope(sessionId) || 'public' : 'public'
    try { await vault.assets.put((async function* () { yield bytes })(), { name: 'Private agent configuration', mime: 'application/json', kind: 'chat', sessionId, hidden: true }, scope, key); if (old) await vault.assets.remove('vault-asset-' + old.id) }
    finally { bytes.fill(0) }
    return next
  })
  locks.set(key, work)
  try { return await work } finally { if (locks.get(key) === work) locks.delete(key) }
}

/** Serialize deletion after already accepted encrypted writes. */
export async function removeAgentData(key:string){
  const previous=locks.get(key)||Promise.resolve()
  const work=previous.catch(()=>{}).then(()=>vaultRuntimeFor(platform).assets.remove(key))
  locks.set(key,work)
  try{await work}finally{if(locks.get(key)===work)locks.delete(key)}
}
