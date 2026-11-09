import type { ModelDependencies } from '../types/adapters'
import { createSubscriptionTransport } from './chatgpt-transport'
import { mergeExtraBody } from '../models/utils/extra-body'
import { subscriptionHeaders } from './chatgpt-subscription'
import { responseFailureReason } from '../providers/definitions/models/venice/failure-reason'

/** Native Codex Images JSON contract; paths and credential destination are fixed. */
export async function requestSubscriptionImages(dependencies: ModelDependencies, input: { model: string; prompt: string; size: string; images: string[]; extraBody?: Record<string, unknown> }, signal?: AbortSignal): Promise<string[]> {
  if (!dependencies.subscription) throw Error('Sign in to OpenAI Sub Unofficial on this device')
  const credential = await dependencies.subscription.getCredential()
  const body = mergeExtraBody({ model: input.model, prompt: input.prompt, size: input.size, n: 1, ...(input.images.length ? { images: input.images.map(image_url => ({ image_url })) } : {}) }, input.extraBody || {})
  const path = input.images.length ? 'images/edits' : 'images/generations'
  const response = await createSubscriptionTransport(dependencies)('https://chatgpt.com/backend-api/codex/' + path, { method: 'POST', redirect: 'error', signal, headers: { ...subscriptionHeaders(credential), Accept: 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw Error('ChatGPT image generation failed (HTTP ' + response.status + '): ' + await responseFailureReason(response))
  const payload = await response.json()
  if (!Array.isArray(payload.data) || !payload.data.length) throw Error('ChatGPT completed without an image. The model or account may not support image generation.')
  return payload.data.slice(0, 4).map((item: any) => {
    if (typeof item.b64_json !== 'string' || item.b64_json.length > 48 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) throw Error('ChatGPT returned an incomplete or invalid image')
    return 'data:' + (item.b64_json.startsWith('/9j/') ? 'image/jpeg' : item.b64_json.startsWith('UklGR') ? 'image/webp' : 'image/png') + ';base64,' + item.b64_json
  })
}
