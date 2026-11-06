import { describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => vi.fn())
vi.mock('@/adapters', () => ({ createModelDependencies: async () => ({ request: { apiRequest: api } }) }))
vi.mock('@/platform', () => ({ default: { type: 'desktop' } }))
import { VeniceSearch } from './venice'
describe('Venice global web search', () => {
  it('uses the configured key and engine directly and filters unsafe citation links', async () => {
    api.mockResolvedValueOnce(Response.json({ results: [{ title: 'Source', url: 'https://example.com', content: 'result' }, { url: 'javascript:bad' }] }))
    expect(await new VeniceSearch('private-key', 'https://api.venice.ai/api/v1', 'exa').search('a query')).toEqual({ items: [{ title: 'Source', link: 'https://example.com', snippet: 'result' }] })
    const request = api.mock.calls[0][0]; expect(request).toMatchObject({ url: 'https://api.venice.ai/api/v1/augment/search', useProxy: false, retry: 0 }); expect(JSON.parse(request.body)).toMatchObject({ search_provider: 'exa' })
  })
})

it.each(['brave','google','exa'])('sends global Venice retrieval to the selected %s engine',async engine=>{api.mockResolvedValueOnce(Response.json({results:[]}));await new VeniceSearch('synthetic-key','https://api.venice.ai/api/v1',engine).search('query');expect(JSON.parse(api.mock.calls.at(-1)![0].body)).toMatchObject({query:'query',search_provider:engine})})
