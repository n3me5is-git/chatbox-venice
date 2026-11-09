import { ApiError } from '../models/errors'
import { createFetchWithProxy } from '../models/utils/fetch-proxy'
import type { ModelDependencies } from '../types/adapters'

/** Native app transport avoids WebView CORS. HTTP statuses remain fetch responses for OAuth/SDK consumers. */
export function createSubscriptionTransport(dependencies: ModelDependencies): typeof globalThis.fetch {
  const request = createFetchWithProxy(true, dependencies)
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (!['https://auth.openai.com', 'https://chatgpt.com'].includes(url.origin) || url.username || url.password) throw Error('Invalid ChatGPT connection destination')
    try { return await request(url, init) }
    catch (error) {
      if (!(error instanceof ApiError) || !error.statusCode || error.statusCode < 400 || error.statusCode > 599) throw error
      return new Response(error.responseBody || '', { status: error.statusCode, headers: error.retryAfter ? { 'retry-after': error.retryAfter } : {} })
    }
  }
}
