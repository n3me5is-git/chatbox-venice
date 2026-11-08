import { expect, it, vi } from 'vitest'
import { createSubscriptionFetch, pollChatGPTDeviceLogin, readSubscriptionImages, refreshChatGPTSubscription, startChatGPTDeviceLogin, CHATGPT_CODEX_ENDPOINT } from './chatgpt-subscription'
import type { ModelDependencies } from '../types/adapters'

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
it('uses the Codex device-code contract, bounded interval and original PKCE exchange', async () => {
  const request = vi.fn().mockResolvedValueOnce(response({ device_auth_id: 'device', user_code: 'ABCD-1234', interval: '5' })).mockResolvedValueOnce(response({}, 403)).mockResolvedValueOnce(response({ authorization_code: 'auth', code_verifier: 'verifier' })).mockResolvedValueOnce(response({ access_token: 'opaque-token', refresh_token: 'refresh', expires_in: 3600 }))
  const code = await startChatGPTDeviceLogin(request); expect(code.interval).toBe(5); expect(await pollChatGPTDeviceLogin(request, code)).toBeUndefined()
  const credential = await pollChatGPTDeviceLogin(request, code); expect(credential?.refreshToken).toBe('refresh')
  const exchange = new URLSearchParams(request.mock.calls.at(-1)![1].body); expect(exchange.get('redirect_uri')).toBe('https://auth.openai.com/deviceauth/callback'); expect(exchange.get('code_verifier')).toBe('verifier')
})
it('does not poll an expired or cancelled device authorization', async () => {
  const fetcher = vi.fn(), code = { userCode: 'code', deviceId: 'id', interval: 5, expiresAt: 0 }
  await expect(pollChatGPTDeviceLogin(fetcher, code)).rejects.toThrow('expired'); expect(fetcher).not.toHaveBeenCalled()
})
it('preserves a refresh token when the server does not rotate it', async () => {
  const value = await refreshChatGPTSubscription(vi.fn(async () => response({ access_token: 'new', expires_in: 1200 })), { accessToken: 'old', refreshToken: 'keep' }); expect(value.refreshToken).toBe('keep')
})
it('pins credentials to the Codex host and forces stateless streaming without API fallback', async () => {
  const request = vi.fn(async (_options: any) => new Response('data: [DONE]\n\n')), dependencies = { request: { apiRequest: request }, subscription: { getCredential: async () => ({ accessToken: 'subscription-secret', extra: { accountId: 'acct' } }) } } as unknown as ModelDependencies
  await createSubscriptionFetch(dependencies)('https://untrusted.example/responses', { method: 'POST', headers: { Authorization: 'Bearer other' }, body: JSON.stringify({ model: 'gpt-5.4', store: true, stream: false, max_output_tokens: 10, tools: [{ type: 'function', name: 'local', parameters: {} }] }) })
  const call = request.mock.calls[0][0] as any
  expect(call.url).toBe(CHATGPT_CODEX_ENDPOINT); expect(call.headers.Authorization).toBe('Bearer subscription-secret'); expect(call.headers['ChatGPT-Account-Id']).toBe('acct'); expect(call.retry).toBe(0)
  const body = JSON.parse(call.body); expect(body.store).toBe(false); expect(body.stream).toBe(true); expect(body.max_output_tokens).toBeUndefined(); expect(body.tools[0].strict).toBe(false)
})
function sse(events: unknown[]) { const data = events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''); return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < data.length; i += 7) controller.enqueue(new TextEncoder().encode(data.slice(i, i + 7))); controller.close() } })) }
it('accepts completed image output, with done-event fallback but no duplicate images', async () => {
  const item = { type: 'image_generation_call', status: 'completed', result: 'iVBORw0KGgo=' }
  expect(await readSubscriptionImages(sse([{ type: 'response.output_item.done', item }, { type: 'response.completed', response: { output: [item] } }]))).toEqual(['data:image/png;base64,iVBORw0KGgo='])
  expect(await readSubscriptionImages(sse([{ type: 'response.output_item.done', item }, { type: 'response.completed', response: {} }]))).toHaveLength(1)
})
it('rejects interrupted, failed, empty or incomplete image generations', async () => {
  await expect(readSubscriptionImages(sse([{ type: 'response.output_item.done', item: { type: 'image_generation_call', result: 'AAAA' } }]))).rejects.toThrow('before completion')
  await expect(readSubscriptionImages(sse([{ type: 'response.failed', response: { error: { message: 'Account image limit' } } }]))).rejects.toThrow('Account image limit')
  await expect(readSubscriptionImages(sse([{ type: 'response.completed', response: { output: [] } }]))).rejects.toThrow('without an image')
  await expect(readSubscriptionImages(response({ error: { message: 'Image tool not available' } }, 400))).rejects.toThrow('Image tool not available')
})
