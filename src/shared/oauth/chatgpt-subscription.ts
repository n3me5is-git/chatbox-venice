import type { OAuthCredentials } from './types'
import type { ModelDependencies } from '../types/adapters'
import { createFetchWithProxy } from '../models/utils/fetch-proxy'
import { CHATGPT_CODEX_CLIENT_VERSION } from './chatgpt-model-catalog'
import { mergeExtraBody } from '../models/utils/extra-body'
import { observeSubscriptionSources, type SubscriptionSearchSource } from './chatgpt-search-sources'

export const CHATGPT_SUB_PROVIDER = 'openai-sub-unofficial'
export const CHATGPT_CODEX_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'
export const CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTH = 'https://auth.openai.com'
export interface ChatGPTDeviceCode { userCode: string; deviceId: string; interval: number; expiresAt: number }
type Fetch = typeof globalThis.fetch

async function json(response: Response): Promise<Record<string, any>> {
  if (!response.ok) throw new Error('ChatGPT request failed (HTTP ' + response.status + '). Check account access or try again later.')
  return response.json()
}
export async function startChatGPTDeviceLogin(fetcher: Fetch, signal?: AbortSignal): Promise<ChatGPTDeviceCode> {
  const data = await json(await fetcher(AUTH + '/api/accounts/deviceauth/usercode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: CHATGPT_CLIENT_ID }), signal }))
  const userCode = data.user_code ?? data.usercode
  if (typeof userCode !== 'string' || typeof data.device_auth_id !== 'string') throw new Error('ChatGPT returned an invalid device login')
  return { userCode, deviceId: data.device_auth_id, interval: Math.min(30, Math.max(3, Number(data.interval) || 5)), expiresAt: Date.now() + 15 * 60 * 1000 }
}
function tokenCredential(data: Record<string, any>, previous?: OAuthCredentials): OAuthCredentials {
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('ChatGPT returned no access token')
  let accountId: string | undefined
  try { const part = data.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); accountId = JSON.parse(atob(part))['https://api.openai.com/auth']?.chatgpt_account_id } catch {}
  return { accessToken: data.access_token, refreshToken: data.refresh_token || previous?.refreshToken, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 - 120000, extra: { transport: 'chatgpt-codex', ...(typeof accountId === 'string' ? { accountId } : {}) } }
}
export async function pollChatGPTDeviceLogin(fetcher: Fetch, code: ChatGPTDeviceCode, signal?: AbortSignal): Promise<OAuthCredentials | undefined> {
  signal?.throwIfAborted()
  if (Date.now() >= code.expiresAt) throw new Error('The ChatGPT login code expired. Start sign-in again.')
  const response = await fetcher(AUTH + '/api/accounts/deviceauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_auth_id: code.deviceId, user_code: code.userCode }), signal })
  if (response.status === 403 || response.status === 404) return undefined
  const data = await json(response)
  if (typeof data.authorization_code !== 'string' || typeof data.code_verifier !== 'string') throw new Error('ChatGPT returned an invalid authorization response')
  const tokens = await json(await fetcher(AUTH + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CHATGPT_CLIENT_ID, code: data.authorization_code, code_verifier: data.code_verifier, redirect_uri: AUTH + '/deviceauth/callback' }).toString(), signal }))
  return tokenCredential(tokens)
}
export async function refreshChatGPTSubscription(fetcher: Fetch, credential: OAuthCredentials, signal?: AbortSignal) {
  if (!credential.refreshToken) throw new Error('Sign in to ChatGPT again to renew this connection')
  const response = await fetcher(AUTH + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: CHATGPT_CLIENT_ID, refresh_token: credential.refreshToken }).toString(), signal })
  return tokenCredential(await json(response), credential)
}
export function subscriptionHeaders(credential: OAuthCredentials): Record<string, string> {
  return { Authorization: 'Bearer ' + credential.accessToken, 'Content-Type': 'application/json', Accept: 'text/event-stream', originator: 'codex_cli_rs', version: CHATGPT_CODEX_CLIENT_VERSION, ...(typeof credential.extra?.accountId === 'string' ? { 'ChatGPT-Account-Id': credential.extra.accountId } : {}) }
}
/** No caller-supplied host is accepted; tokens can only reach the Codex backend. */
export function createSubscriptionFetch(dependencies: ModelDependencies, options: { webSearch?: boolean; extraBody?: Record<string, unknown>; onSource?: (source: SubscriptionSearchSource) => void } = {}): Fetch {
  return async (_input, init) => {
    if (!dependencies.subscription) throw new Error('Sign in to OpenAI Sub Unofficial on this device')
    const credential = await dependencies.subscription.getCredential()
    const body = mergeExtraBody(JSON.parse(String(init?.body || '{}')), options.extraBody || {}) as Record<string, any>
    const imageRequest = Array.isArray(body.tools) && body.tools.some((tool: any) => tool.type === 'image_generation')
    if (options.webSearch === false && Array.isArray(body.tools)) body.tools = body.tools.filter((tool: any) => !['web_search', 'web_search_preview'].includes(tool.type))
    if (options.webSearch && !imageRequest && !(body.tools || []).some((tool: any) => tool.type === 'web_search')) body.tools = [...(body.tools || []), { type: 'web_search' }]
    body.store = false; body.stream = true
    body.instructions ||= 'You are a helpful assistant.'
    delete body.max_output_tokens; delete body.max_tokens; delete body.temperature; delete body.top_p
    const include = Array.isArray(body.include) ? body.include : []
    body.include = [...new Set([...include, 'reasoning.encrypted_content'])]
    if (Array.isArray(body.tools)) body.tools = body.tools.map((tool: Record<string, unknown>) => tool.type === 'function' ? { ...tool, strict: false } : tool)
    const response = await createFetchWithProxy(false, dependencies)(CHATGPT_CODEX_ENDPOINT, { ...init, method: 'POST', redirect: 'error', headers: subscriptionHeaders(credential), body: JSON.stringify(body) })
    return options.onSource && !imageRequest ? observeSubscriptionSources(response, options.onSource) : response
  }
}
export async function readSubscriptionImages(response: Response, signal?: AbortSignal): Promise<string[]> {
  if (!response.ok) {
    const { responseFailureReason } = await import('../providers/definitions/models/venice/failure-reason')
    const reason = await responseFailureReason(response)
    throw new Error('ChatGPT image generation failed (HTTP ' + response.status + ')' + (reason ? ': ' + reason : ''))
  }
  if (!response.body) throw new Error('ChatGPT returned no image stream')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', total = 0, completed = false, events = 0
  let final: any[] | undefined; const done: any[] = []
  try {
    while (true) {
      signal?.throwIfAborted(); const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.length; if (total > 64 * 1024 * 1024) throw new Error('ChatGPT image stream exceeded the size limit')
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data || data === '[DONE]') continue
        if (++events > 2000) throw new Error('ChatGPT image stream exceeded the event limit')
        const event = JSON.parse(data)
        if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') throw new Error(String(event.response?.error?.message || event.error?.message || event.message || event.response?.incomplete_details?.reason || 'ChatGPT image generation failed').slice(0, 2000))
        if (event.type === 'response.output_item.done' && event.item?.type === 'image_generation_call') done.push(event.item)
        if (event.type === 'response.completed') { completed = true; final = event.response?.output?.filter((item: any) => item.type === 'image_generation_call'); break }
      }
      if (completed) break
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  if (!completed) throw new Error('ChatGPT image stream ended before completion; no automatic retry was made')
  const items = final?.length ? final : done
  const images = items.slice(0, 4).map(item => {
    if (item.status && item.status !== 'completed' || typeof item.result !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.result) || item.result.length > 48 * 1024 * 1024) throw new Error('ChatGPT returned an incomplete or invalid image')
    const prefix = item.result.startsWith('/9j/') ? 'image/jpeg' : item.result.startsWith('UklGR') ? 'image/webp' : 'image/png'
    return 'data:' + prefix + ';base64,' + item.result
  })
  if (!images.length) throw new Error('ChatGPT completed without an image. The model or account may not support image generation.')
  return images
}
