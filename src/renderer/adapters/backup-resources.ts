import type { BackupHostResources } from '@chatbox/core/backup-host'
import type { BackupResourceSource, BackupWorkspace } from '@chatbox/core/backup-v3'
import type { ByteSink, ClosableByteSource } from '@chatbox/core/io'
import { readFileBytes } from '@chatbox/core/io'
import platform from '@/platform'
import { bytesToBase64 } from '@/platform/binary-chunks'
import type { VaultRuntime } from '@/packages/vault/runtime'

const CHUNK = 64 * 1024
const STRING_LIMIT = 64 * 1024 * 1024
const encoder = new TextEncoder()
async function* chunks(source: ClosableByteSource): AsyncIterable<Uint8Array> {
  if (source.chunks) yield* source.chunks()
  else
    for (let offset = 0; offset < source.size; offset += CHUNK)
      yield await readFileBytes(source, offset, Math.min(CHUNK, source.size - offset))
}
function stringSource(value: string): ClosableByteSource {
  if (value.length > STRING_LIMIT) throw new Error('Resource exceeds this storage adapter’s size budget')
  const bytes = encoder.encode(value)
  if (bytes.length > STRING_LIMIT) throw new Error('Resource exceeds this storage adapter’s size budget')
  return {
    size: bytes.length,
    readBytes: async (offset, length) => bytes.slice(offset, offset + length),
    close: async () => {},
  }
}
async function normalized(source: ClosableByteSource): Promise<BackupResourceSource> {
  try {
    const prefix = new TextDecoder().decode(await readFileBytes(source, 0, Math.min(1024, source.size)))
    if (!prefix.startsWith('data:')) return { mimeType: 'text/plain', contentType: 'text', source }
    const comma = prefix.indexOf(',')
    if (comma < 0) throw new Error('Resource data URL header is too long')
    const header = prefix.slice(5, comma)
    if (!header.endsWith(';base64')) throw new Error('Unsupported resource data URL encoding')
    const bodyOffset = comma + 1,
      bodySize = source.size - bodyOffset
    const end = new TextDecoder().decode(
      await readFileBytes(source, Math.max(bodyOffset, source.size - 2), Math.min(2, bodySize))
    )
    const padding = end.endsWith('==') ? 2 : end.endsWith('=') ? 1 : 0
    if (bodySize % 4 !== 0) throw new Error('Invalid resource base64 length')
    return {
      mimeType: header.slice(0, -7) || 'application/octet-stream',
      contentType: 'binary',
      source: {
        size: (bodySize / 4) * 3 - padding,
        close: () => source.close(),
        async *chunks() {
          for (let offset = bodyOffset; offset < source.size; offset += CHUNK) {
            const text = new TextDecoder().decode(
              await readFileBytes(source, offset, Math.min(CHUNK, source.size - offset))
            )
            const binary = atob(text),
              bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            yield bytes
          }
        },
      },
    }
  } catch (error) {
    await source.close()
    throw error
  }
}
async function encodedSink(sink: ByteSink, mimeType: string, contentType: 'text' | 'binary'): Promise<ByteSink> {
  if (contentType === 'text') return sink
  try {
    await sink.write(encoder.encode(`data:${mimeType};base64,`))
  } catch (error) {
    await sink.abort()
    throw error
  }
  let remainder = new Uint8Array(0)
  return {
    async write(bytes) {
      const input = new Uint8Array(remainder.length + bytes.length)
      input.set(remainder)
      input.set(bytes, remainder.length)
      const end = input.length - (input.length % 3)
      if (end) await sink.write(encoder.encode(bytesToBase64(input.subarray(0, end))))
      remainder = input.slice(end)
    },
    async close() {
      if (remainder.length) await sink.write(encoder.encode(bytesToBase64(remainder)))
      await sink.close()
    },
    abort: () => sink.abort(),
  }
}
async function readStored(source: ClosableByteSource): Promise<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true }),
    parts: string[] = []
  try {
    if (source.size > STRING_LIMIT) throw new Error('Resource exceeds this storage adapter’s size budget')
    for await (const bytes of chunks(source)) parts.push(decoder.decode(bytes, { stream: true }))
    parts.push(decoder.decode())
    return parts.join('')
  } finally {
    await source.close()
  }
}

export async function openVaultBackupResource(vault:VaultRuntime,key:string):Promise<BackupResourceSource|null>{
  const header=await vault.find(key);if(!header)return null
  if(header.scope!=='public')throw new Error('Protected library files require an encrypted library backup in Settings → Data & Backup')
  const info=await vault.assets.info(header)
  return {mimeType:info.mime,contentType:'binary',source:{size:header.bytes,close:async()=>{},chunks:()=>vault.assets.read(`vault-asset-${header.id}`)}}
}
export function createRendererBackupResources(workspace: BackupWorkspace): BackupHostResources {
  const ipc = platform.type === 'desktop' ? window.electronAPI : null
  return {
    async open(key) {
      if(process.env.NODE_ENV!=='test'){
        const {vaultRuntimeFor}=await import('@/packages/vault/runtime');const resource=await openVaultBackupResource(vaultRuntimeFor(platform),key);if(resource)return resource
      }
      if (platform.resourceFiles) {
        const source = await platform.resourceFiles.open(key)
        return source ? normalized(source) : null
      }
      const value = await platform.getStoreBlob(key)
      return value === null ? null : normalized(stringSource(value))
    },
    async stage(jobId, resource) {
      if (ipc) {
        const token: string = await ipc.invoke('backup-resource:create', jobId, resource.resourceId)
        const raw: ByteSink = {
          async write(bytes) {
            for (let offset = 0; offset < bytes.length; offset += CHUNK)
              await ipc.invoke('file-transfer:write', token, bytes.subarray(offset, offset + CHUNK))
          },
          close: () => ipc.invoke('file-transfer:finish', token, true),
          abort: () => ipc.invoke('file-transfer:finish', token, false),
        }
        return encodedSink(raw, resource.mimeType, resource.contentType)
      }
      if (resource.size > STRING_LIMIT / 2) throw new Error('Resource exceeds this storage adapter’s size budget')
      return encodedSink(
        await workspace.createFile(`resource:${resource.resourceId}`),
        resource.mimeType,
        resource.contentType
      )
    },
    async publish(jobId, key) {
      if (ipc) {
        const vault=process.env.NODE_ENV==='test'?null:(await import('@/packages/vault/runtime')).vaultRuntimeFor(platform)
        if(vault){await vault.projects.assertApp();const existing=await vault.find(key);if(existing)await vault.keys.key(existing.scope)}
        await ipc.invoke('backup-resource:publish', jobId, key)
        if(process.env.NODE_ENV!=='test'){const archive=(await import('@/packages/archive-storage/runtime')).archiveRuntimeFor(platform);if(archive&&(await archive.engine.state()).enabled)await archive.guard(()=>archive.importLegacyBlob(key,true))}
        if(vault&&platform.resourceFiles&&await vault.available()){
          const stored=await platform.resourceFiles.open(key)
          if(stored){const resource=await normalized(stored)
            if(resource.contentType==='binary'&&/^(image|audio|video)\//.test(resource.mimeType)){
              try{await vault.putBytes(key,chunks(resource.source),resource.mimeType)}finally{await resource.source.close()}
            }else await resource.source.close()
          }
        }
        return
      }
      await platform.setStoreBlob(key, await readStored(await workspace.openFile(`resource:${key}`)))
    },
    async cleanup(jobId) {
      if (ipc) await ipc.invoke('backup-resource:cleanup', jobId)
    },
  }
}
