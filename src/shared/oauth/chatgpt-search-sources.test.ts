import { expect, it, vi } from 'vitest'
import { observeSubscriptionSources, subscriptionSourcesFooter } from './chatgpt-search-sources'
it('preserves SSE bytes and exposes safe deduplicable source links from annotations', async () => {
  const events=[{type:'response.output_text.annotation.added',annotation:{type:'url_citation',url:'https://example.com/a(b)',title:'Example [source]'}},{type:'response.completed',response:{output:[{content:[{annotations:[{url:'javascript:alert(1)'},{url:'https://example.org',title:'Second'}]}]}]}}]
  const raw=events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''), source=vi.fn()
  const bytes=new TextEncoder().encode(raw); const response=new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close()}}))
  expect(await observeSubscriptionSources(response,source).text()).toBe(raw);expect(source).toHaveBeenCalledTimes(2)
  const footer=subscriptionSourcesFooter(source.mock.calls.map(call=>call[0]));expect(footer).toContain('https://example.com/a%28b%29');expect(footer).not.toContain('javascript:')
})
