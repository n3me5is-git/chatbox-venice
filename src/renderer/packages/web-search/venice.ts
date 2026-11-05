import { createModelDependencies } from '@/adapters'
import type { SearchResult } from '@shared/types'
import WebSearch from './base'
import { mediaOrigin } from '@shared/providers/definitions/models/venice/media'
export class VeniceSearch extends WebSearch {
  constructor(private key: string, private host?: string, private engine = 'brave') { super() }
  async search(query: string, signal?: AbortSignal): Promise<SearchResult> {
    const response = await (await createModelDependencies()).request.apiRequest({ url: mediaOrigin(this.host) + '/augment/search', method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, limit: 8, search_provider: this.engine }), signal, retry: 0, useProxy: false })
    if (!response.ok) throw new Error(`Ricerca Venice non riuscita (HTTP ${response.status})`)
    const data = await response.json()
    return { items: (Array.isArray(data.results) ? data.results : []).flatMap((r: Record<string, unknown>) => {
      try { if (typeof r.url !== 'string' || !['http:', 'https:'].includes(new URL(r.url).protocol)) return [] } catch { return [] }
      return [{ title: String(r.title || r.url), link: String(r.url), snippet: String(r.content || r.snippet || r.description || '') }]
    }) }
  }
}
