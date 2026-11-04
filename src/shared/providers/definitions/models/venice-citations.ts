type Citation = { url: string; title?: string }

function sourceFooter(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const citations = value.filter((item): item is Citation => {
    if (!item || typeof item.url !== 'string') return false
    try { return ['http:', 'https:'].includes(new URL(item.url).protocol) } catch { return false }
  })
  if (!citations.length) return ''
  return '\n\n**Sources**\n' + citations.map((item, index) => `${index + 1}. [${String(item.title || item.url).replace(/[\[\]\\\n\r]/g, '')}](<${item.url.replace(/[<>\n\r]/g, '')}>)`).join('\n')
}

// Keep Venice citations useful even though OpenAI-compatible SDKs discard the
// vendor metadata. Sources become ordinary local message text and survive export.
export async function withVeniceCitations(response: Response): Promise<Response> {
  if (!response.ok || !response.body) return response
  const type = response.headers.get('content-type') || ''
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  if (type.includes('application/json')) {
    const data = await response.json()
    const footer = sourceFooter(data.venice_parameters?.web_search_citations)
    if (footer && typeof data.choices?.[0]?.message?.content === 'string') {
      data.choices[0].message.content += footer
    }
    return new Response(JSON.stringify(data), { status: response.status, headers })
  }
  if (!type.includes('text/event-stream')) return response
  let pending = ''
  let citations: unknown
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })
      const frames = pending.split(/\r?\n\r?\n/)
      pending = frames.pop() || ''
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (data === '[DONE]') {
          const footer = sourceFooter(citations)
          if (footer) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: footer }, finish_reason: null }] })}\n\n`))
        } else {
          try { const parsed = JSON.parse(data); citations = parsed.venice_parameters?.web_search_citations ?? citations } catch { /* Keep non-JSON frames unchanged. */ }
        }
        controller.enqueue(encoder.encode(frame + '\n\n'))
      }
    },
    flush(controller) { pending += decoder.decode(); if (pending) controller.enqueue(encoder.encode(pending)) },
  })
  return new Response(response.body.pipeThrough(transform), { status: response.status, headers })
}
