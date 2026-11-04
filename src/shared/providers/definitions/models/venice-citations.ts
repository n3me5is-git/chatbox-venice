import { v4 as uuid } from 'uuid'

type Citation = { url: string; title?: string }

function sourceFooter(value: unknown, namespace: string): string {
  if (!Array.isArray(value)) return ''
  const citations = value.flatMap((item, index) => {
    if (!item || typeof item.url !== 'string') return []
    try {
      if (!['http:', 'https:'].includes(new URL(item.url).protocol)) return []
      return [{ ...(item as Citation), number: index + 1 }]
    } catch { return [] }
  })
  if (!citations.length) return ''
  const url = (item: Citation) => item.url.replace(/[<>\n\r]/g, '')
  return '\n\n**Sources**\n' + citations.map((item) => `${item.number}. [${String(item.title || item.url).replace(/[\[\]\\\n\r]/g, '')}](<${url(item)}>)`).join('\n')
    + '\n\n' + citations.map((item) => `[${namespace}-${item.number}]: <${url(item)}>`).join('\n') + '\n'
}

function linkReferences(text: string, namespace: string): string {
  return text.replace(/\^(\d+(?:\s*,\s*\d+)*)\^/g, (_, numbers: string) =>
    numbers.split(',').map((number) => `[${number.trim()}][${namespace}-${number.trim()}]`).join(' '))
}

// Standard Markdown references resolve even when Venice sends the citations
// after the answer. Both inline links and sources survive local storage/export.
export async function withVeniceCitations(response: Response): Promise<Response> {
  if (!response.ok || !response.body) return response
  const type = response.headers.get('content-type') || ''
  const namespace = 'venice-source-' + uuid()
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  if (type.includes('application/json')) {
    const data = await response.json()
    const footer = sourceFooter(data.venice_parameters?.web_search_citations, namespace)
    if (footer && typeof data.choices?.[0]?.message?.content === 'string') {
      data.choices[0].message.content = linkReferences(data.choices[0].message.content, namespace) + footer
    }
    return new Response(JSON.stringify(data), { status: response.status, headers })
  }
  if (!type.includes('text/event-stream')) return response
  let pending = ''
  let pendingReference = ''
  let citations: unknown
  let completed = false
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const emit = (frame: string) => controller.enqueue(encoder.encode(frame + '\n\n'))
      pending += decoder.decode(chunk, { stream: true })
      const frames = pending.split(/\r?\n\r?\n/)
      pending = frames.pop() || ''
      for (let frame of frames) {
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (data === '[DONE]') {
          const footer = pendingReference + sourceFooter(citations, namespace)
          pendingReference = ''
          completed = true
          if (footer) emit(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: footer }, finish_reason: null }] })}`)
        } else {
          try {
            const parsed = JSON.parse(data)
            citations = parsed.venice_parameters?.web_search_citations ?? citations
            const delta = parsed.choices?.find((choice: { index: number }) => choice.index === 0)?.delta
            if (typeof delta?.content === 'string') {
              let content = linkReferences(pendingReference + delta.content, namespace)
              pendingReference = content.match(/\^[\d,\s]*$/)?.[0] || ''
              if (pendingReference) content = content.slice(0, -pendingReference.length)
              delta.content = content
              frame = `data: ${JSON.stringify(parsed)}`
            }
          } catch { /* Keep non-JSON frames unchanged. */ }
        }
        emit(frame)
      }
    },
    flush(controller) {
      pending += decoder.decode()
      if (pending) controller.enqueue(encoder.encode(pending + '\n\n'))
      if (!completed) {
        const footer = pendingReference + sourceFooter(citations, namespace)
        if (footer) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: footer }, finish_reason: null }] })}\n\n`))
      }
    },
  })
  return new Response(response.body.pipeThrough(transform), { status: response.status, headers })
}
