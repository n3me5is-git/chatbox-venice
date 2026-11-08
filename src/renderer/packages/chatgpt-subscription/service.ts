import { CHATGPT_SUB_PROVIDER, startChatGPTDeviceLogin, pollChatGPTDeviceLogin, refreshChatGPTSubscription, subscriptionHeaders, type ChatGPTDeviceCode } from '@shared/oauth/chatgpt-subscription'
import type { OAuthCredentials } from '@shared/oauth'
import type { ProviderModelInfo } from '@shared/types'
import { createFetchWithProxy } from '@shared/models/utils/fetch-proxy'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { settingsStore } from '@/stores/settingsStore'

const key = 'private-auth:chatgpt-subscription:v1'
const pendingKey = 'private-auth:chatgpt-subscription-pending:v1'
const vault = () => vaultRuntimeFor(platform)
let renewal: Promise<OAuthCredentials> | undefined
let epoch = 0
async function fetcher() { return createFetchWithProxy(false, await (await import('@/adapters/RendererModelDependencies')).createModelDependencies()) }
async function save(value: OAuthCredentials | ChatGPTDeviceCode, expectedEpoch = epoch, alias = key) {
  if (epoch !== expectedEpoch) throw new Error('ChatGPT connection was closed')
  if (!await vault().available()) throw new Error('Device encryption is unavailable')
  const bytes = new TextEncoder().encode(JSON.stringify(value)), old = await vault().assets.header(alias)
  try {
    await vault().assets.put((async function* () { yield bytes })(), { name: 'ChatGPT subscription credentials', mime: 'application/json', kind: 'chat', hidden: true }, 'public', alias)
    if (old) await vault().assets.remove('vault-asset-' + old.id)
  } finally { bytes.fill(0) }
  if (epoch !== expectedEpoch) { await vault().assets.remove(alias); throw new Error('ChatGPT connection was closed') }
}
async function read(alias: string): Promise<any> {
  if (!await vault().available()) throw new Error('Unlock the app to use the ChatGPT connection')
  const header = await vault().assets.header(alias)
  if (!header || header.bytes > 64000) throw new Error('Sign in to OpenAI Sub Unofficial on this device')
  const bytes = new Uint8Array(header.bytes); let at = 0
  try { for await (const chunk of vault().assets.read(alias)) { bytes.set(chunk, at); at += chunk.length; chunk.fill(0) }; return JSON.parse(new TextDecoder().decode(bytes)) }
  finally { bytes.fill(0) }
}
export async function subscriptionCredential(): Promise<OAuthCredentials> {
  const current = await read(key) as OAuthCredentials
  if (typeof current.accessToken !== 'string' || !current.accessToken) throw Error('Invalid stored ChatGPT connection')
  if (!current.expiresAt || current.expiresAt > Date.now() + 60000) return current
  if (!renewal) {
    const version = epoch
    renewal = (async () => { const next = await refreshChatGPTSubscription(await fetcher(), current); await save(next, version); return next })().finally(() => { renewal = undefined })
  }
  return renewal
}
export async function beginSubscriptionLogin(signal?: AbortSignal) { if (platform.type === 'web') throw Error('Use the desktop or Android app for subscription sign-in'); if (!await vault().available()) throw Error('Device encryption is unavailable'); const code = await startChatGPTDeviceLogin(await fetcher(), signal); signal?.throwIfAborted(); await save(code, epoch, pendingKey); return code }
export async function pendingSubscriptionLogin(): Promise<ChatGPTDeviceCode | undefined> {
  if (!await vault().assets.header(pendingKey)) return undefined
  const value = await read(pendingKey)
  if (typeof value.deviceId !== 'string' || typeof value.userCode !== 'string' || value.expiresAt <= Date.now()) { await vault().assets.remove(pendingKey); return undefined }
  return value
}
export async function cancelSubscriptionLogin() { await vault().assets.remove(pendingKey) }
export async function completeSubscriptionLogin(code: ChatGPTDeviceCode, signal: AbortSignal) {
  const version = epoch, request = await fetcher()
  while (!signal.aborted) {
    const value = await pollChatGPTDeviceLogin(request, code, signal)
    if (value) {
      signal.throwIfAborted(); await save(value, version)
      await vault().assets.remove(pendingKey)
      // This is only a connection marker. Real credentials never enter settings/exports.
      settingsStore.getState().setSettings({ providers: { ...settingsStore.getState().providers, [CHATGPT_SUB_PROVIDER]: { ...settingsStore.getState().providers?.[CHATGPT_SUB_PROVIDER], activeAuthMode: 'oauth', oauth: { accessToken: 'vault-stored-on-this-device', extra: { transport: 'chatgpt-codex-vault' } } } } })
      return
    }
    await new Promise<void>((resolve, reject) => { const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }; const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, code.interval * 1000); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort() })
  }
  signal.throwIfAborted()
}
export async function disconnectSubscription() {
  epoch++; await vault().assets.remove(key); await vault().assets.remove(pendingKey)
  settingsStore.getState().setSettings({ providers: { ...settingsStore.getState().providers, [CHATGPT_SUB_PROVIDER]: { ...settingsStore.getState().providers?.[CHATGPT_SUB_PROVIDER], oauth: undefined, activeAuthMode: undefined } } })
}
export async function subscriptionModels(signal?: AbortSignal): Promise<ProviderModelInfo[]> {
  const credential = await subscriptionCredential(), request = await fetcher()
  const response = await request('https://chatgpt.com/backend-api/codex/models?client_version=0.111.0', { headers: subscriptionHeaders(credential), signal })
  if (!response.ok) throw Error('ChatGPT model catalog is unavailable (HTTP ' + response.status + '). Configured models are kept.')
  const payload = await response.json()
  if (!Array.isArray(payload.models)) throw Error('ChatGPT returned an invalid model catalog')
  const models = payload.models.filter((model: any) => typeof model.slug === 'string' && model.visibility !== 'hide').map((model: any): ProviderModelInfo => ({ modelId: model.slug, nickname: typeof model.display_name === 'string' ? model.display_name : model.slug, capabilities: ['tool_use', 'vision', ...(model.supports_reasoning_summaries ? ['reasoning' as const] : [])] }))
  return [...models, ...['gpt-image-2', 'gpt-image-1.5'].map(modelId => ({ modelId, type: 'image' as const }))]
}
