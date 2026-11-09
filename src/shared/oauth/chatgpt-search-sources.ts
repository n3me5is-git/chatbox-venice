export interface SubscriptionSearchSource { url: string; title: string }

/** Observe annotations without altering SSE events consumed by the Responses SDK. */
export function observeSubscriptionSources(response: Response, onSource: (source: SubscriptionSearchSource) => void): Response {
  if (!response.body || !response.ok) return response
  const decoder = new TextDecoder(); let pending = ''
  const visit = (annotation: any) => {
    const value = annotation?.url_citation || annotation
    if (typeof value?.url !== 'string') return
    try { const url = new URL(value.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return; onSource({ url: url.href, title: typeof value.title === 'string' ? value.title.slice(0, 300) : url.hostname }) } catch {}
  }
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
    pending += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n')
    let end: number
    while ((end = pending.indexOf('\n\n')) >= 0) {
      const frame = pending.slice(0, end); pending = pending.slice(end + 2)
      const text = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (!text || text === '[DONE]') continue
      try {
        const event = JSON.parse(text)
        if (event.type === 'response.output_text.annotation.added') visit(event.annotation)
        if (event.type === 'response.completed') for (const item of event.response?.output || []) for (const part of item.content || []) for (const annotation of part.annotations || []) visit(annotation)
      } catch {}
    }
    // Discard oversized unknown events; never retain the entire response in memory.
    if (pending.length > 1024 * 1024) pending = ''
    controller.enqueue(chunk)
  } }))
  const headers = new Headers(response.headers); headers.delete('content-length')
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}
export function subscriptionSourcesFooter(sources: Iterable<SubscriptionSearchSource>) {
  const values = [...sources].slice(0, 50)
  return values.length ? '\n\n' + values.map((source, i) => `[${i + 1}. ${source.title.replace(/[\[\]\r\n]/g, ' ')}](${source.url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`).join(' · ') : ''
}
