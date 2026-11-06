import { embed } from 'ai'
import type { LanguageModelV4 } from '@ai-sdk/provider'
import type { ModelDependencies } from '@shared/types/adapters'
import { describe, expect, it, vi } from 'vitest'
import Venice, { fetchVeniceModels, getVeniceImageCapabilities, getVeniceParameters } from './venice'
import { withVeniceCitations } from './venice-citations'
import { prepareVeniceSearch } from './venice-search'

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
function dependencies(apiRequest = vi.fn()): ModelDependencies {
  return { request: { apiRequest, fetchWithOptions: vi.fn() }, storage: { saveImage: vi.fn(), getImage: vi.fn() },
    sentry: { captureException: vi.fn(), withScope: vi.fn() }, getRemoteConfig: vi.fn(), platformType: 'desktop' }
}
class TestVenice extends Venice { exposeModel(): LanguageModelV4 { return this.getChatModel() } }

describe('Venice direct API integration', () => {
  it('discovers chat, generation and editing models with capabilities, excluding offline and unrelated media', async () => {
    const api = vi.fn().mockResolvedValue(json({ data: [
      { id: 'chat', type: 'text', model_spec: { name: 'Chat', availableContextTokens: 32000, capabilities: { supportsVision: true, supportsFunctionCalling: true, supportsWebSearch: true } } },
      { id: 'image', type: 'image' }, { id: 'edit', type: 'inpaint', model_spec: { constraints: { maxInputImages: 2 } } },
      { id: 'old', type: 'text', model_spec: { offline: true } }, { id: 'video', type: 'video' },
    ] }))
    const models = await fetchVeniceModels({ apiKey: 'test-key' }, dependencies(api))
    expect(models.map((m) => [m.modelId, m.type])).toEqual([['chat', 'chat'], ['image', 'image'], ['edit', 'image']])
    expect(models[0]).toMatchObject({ contextWindow: 32000, capabilities: ['vision', 'tool_use', 'web_search'] })
    expect(getVeniceImageCapabilities(models[2]).inputReferences).toEqual({ min: 1, max: 2 })
    expect(api.mock.calls[0][0]).toMatchObject({ url: 'https://api.venice.ai/api/v1/models?type=all', useProxy: false })
  })
  it('preserves provider options and per-model overrides in non-streaming chat', async () => {
    const api = vi.fn().mockResolvedValue(json({ id: 'test', model: 'chat', created: 1, choices: [{ index: 0, message: { role: 'assistant', content: 'answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 }, venice_parameters: { web_search_citations: [{ title: 'Source', url: 'https://example.com' }] } }))
    const model = new Venice({ apiKey: 'test-key', apiHost: 'https://api.venice.ai/api/v1/', model: { modelId: 'chat', apiStyle: 'openai', extraBody: { venice_parameters: { include_venice_system_prompt: false } } }, stream: false, venice: { webSearch: 'on', webScraping: true } }, dependencies(api))
    const result = await model.chat([{ role: 'user', content: 'hello' }], {})
    const sent = JSON.parse(api.mock.calls[0][0].body)
    expect(sent.venice_parameters).toMatchObject({ enable_web_search: 'on', enable_web_scraping: true, include_venice_system_prompt: false })
    expect(JSON.stringify(result)).toContain('https://example.com')
    expect(model.usesNativeWebSearch).toBe(false)
  })
  it('carries search citations across split SSE frames into the SDK text stream', async () => {
    const frames = [
      'data: {"choices":[{"index":0,"delta":{"content":"Answer ^"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":"1^"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"venice_parameters":{"web_search_citations":[{"url":"https://example.com","title":"Source"}]}}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const encoder = new TextEncoder()
    const api = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode(frames.slice(0, 79))); controller.enqueue(encoder.encode(frames.slice(79))); controller.close()
    } }), { headers: { 'content-type': 'text/event-stream' } }))
    const model = new TestVenice({ apiKey: 'test', apiHost: 'https://api.venice.ai/api/v1', model: { modelId: 'chat' } }, dependencies(api))
    const { stream } = await model.exposeModel().doStream({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] })
    const parts = []
    const reader = stream.getReader()
    while (true) { const next = await reader.read(); if (next.done) break; parts.push(next.value) }
    expect(JSON.stringify(parts)).toContain('https://example.com')
    expect(parts.some((part) => part.type === 'error')).toBe(false)
    const text = parts.filter((part) => part.type === 'text-delta').map((part) => part.delta).join('')
    const namespace = text.match(/Answer \[1\]\[(venice-source-[\w-]+)-1\]/)?.[1]
    expect(namespace).toBeTruthy()
    expect(text).toContain(`[${namespace}-1]: <https://example.com>`)
  })
  it('keeps false values for image moderation and sends each billable request once', async () => {
    const api = vi.fn().mockImplementation(async () => json({ images: ['cG5n'] }))
    const model = new Venice({ apiKey: 'test', apiHost: 'https://api.venice.ai/api/v1', model: { modelId: 'image' }, venice: { imageSafeMode: false, imageWebSearch: true, image: { seed: 0, steps: 8, format: 'webp', embed_exif_metadata: false } } }, dependencies(api))
    const callback = vi.fn()
    expect(await model.paint({ prompt: 'local prompt', num: 2, aspectRatio: '16:9' }, undefined, callback)).toEqual(['data:image/webp;base64,cG5n', 'data:image/webp;base64,cG5n'])
    expect(api).toHaveBeenCalledTimes(2)
    expect(JSON.parse(api.mock.calls[0][0].body)).toMatchObject({ safe_mode: false, enable_web_search: true, seed: 0, steps: 8, aspect_ratio: '16:9', embed_exif_metadata: false })
    expect(api.mock.calls[0][0]).toMatchObject({ retry: 0, useProxy: false })
    expect(callback).toHaveBeenCalledTimes(2)
  })
  it('uses modelId and a binary response for native image editing', async () => {
    const api = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }))
    const model = new Venice({ apiKey: 'test', apiHost: 'https://api.venice.ai/api/v1', model: { modelId: 'edit', vendorMetadata: { veniceType: 'inpaint', constraints: { maxInputImages: 2 } } } }, dependencies(api))
    const result = await model.paint({ prompt: 'edit', num: 1, images: [{ imageUrl: 'data:image/png;base64,aA==' }] })
    expect(result).toEqual(['data:image/png;base64,AQID'])
    expect(JSON.parse(api.mock.calls[0][0].body)).toMatchObject({ modelId: 'edit', images: ['data:image/png;base64,aA=='] })
    expect(api.mock.calls[0][0].url).toMatch(/\/image\/multi-edit$/)
  })
  it('fails locally on invalid sizing and aborts without making a billable image request', async () => {
    const api = vi.fn()
    const model = new Venice({ apiKey: 'test', apiHost: 'https://api.venice.ai/api/v1', model: { modelId: 'image' }, venice: { image: { width: 1024 } } }, dependencies(api))
    await expect(model.paint({ prompt: 'image', num: 1 })).rejects.toThrow('both image width and height')
    const controller = new AbortController(); controller.abort()
    const other = new Venice({ apiKey: 'test', apiHost: 'https://api.venice.ai/api/v1', model: { modelId: 'image' } }, dependencies(api))
    await expect(other.paint({ prompt: 'image', num: 1 }, controller.signal)).rejects.toThrow()
    expect(api).not.toHaveBeenCalled()
  })
  it('uses direct Venice search with the selected backend and preserves local history input', async () => {
    const api = vi.fn().mockResolvedValue(json({ results: [{ url: 'https://example.com', title: 'News' }] }))
    const messages = [{ role: 'user' as const, content: 'latest news' }]
    const result = await prepareVeniceSearch(messages, { webSearch: 'on', searchProvider: 'exa' }, 'key', 'https://api.venice.ai/api/v1', dependencies(api), false)
    expect(result.messages).toHaveLength(2)
    expect(messages).toHaveLength(1)
    expect(JSON.parse(api.mock.calls[0][0].body)).toEqual({ query: 'latest news', limit: 8, search_provider: 'exa' })
    expect(getVeniceParameters({ webSearch: 'on', searchProvider: 'exa' }).enable_web_search).toBe('off')
  })
  it('rejects automatic backend search on models without tools instead of silently switching providers', async () => {
    const api = vi.fn()
    await expect(prepareVeniceSearch([], { webSearch: 'auto', searchProvider: 'brave' }, 'key', 'https://api.venice.ai/api/v1', dependencies(api), false)).rejects.toThrow('requires a model with tool use')
    expect(api).not.toHaveBeenCalled()
  })
  it('does not turn unsafe citation URLs into Markdown links', async () => {
    const response = await withVeniceCitations(json({ choices: [{ message: { content: 'answer' } }], venice_parameters: { web_search_citations: [{ url: 'javascript:alert(1)' }] } }))
    expect((await response.json()).choices[0].message.content).toBe('answer')
  })
  it('preserves reference numbers when invalid source URLs occur before valid sources', async () => {
    const response = await withVeniceCitations(json({ choices: [{ message: { content: 'Answer ^2^' } }], venice_parameters: { web_search_citations: [{ url: 'javascript:alert(1)' }, { url: 'https://example.com', title: 'Source' }] } }))
    const text = (await response.json()).choices[0].message.content
    const namespace = text.match(/Answer \[2\]\[(venice-source-[\w-]+)-2\]/)?.[1]
    expect(namespace).toBeTruthy()
    expect(text).toContain(`[${namespace}-2]: <https://example.com>`)
    expect(text).not.toContain('javascript:')
  })

  it('uses different reference labels for messages exported together', async () => {
    const convert = async (url: string) => {
      const result = await withVeniceCitations(json({ choices: [{ message: { content: 'Answer ^1^' } }], venice_parameters: { web_search_citations: [{ url }] } }))
      return (await result.json()).choices[0].message.content as string
    }
    const first = await convert('https://first.example.com')
    const second = await convert('https://second.example.com')
    const label = (text: string) => text.match(/\[1\]\[([^\]]+)\]/)?.[1]
    expect(label(first)).toBeTruthy()
    expect(label(second)).toBeTruthy()
    expect(label(first)).not.toBe(label(second))
  })

})

it('discovers native embeddings for knowledge bases and preserves privacy metadata', async () => {
  const api = vi.fn().mockResolvedValue(json({ data: [{ id: 'qwen-embedding', type: 'embedding', model_spec: { privacy: 'private' } }] }))
  expect(await fetchVeniceModels({ apiKey: 'test' }, dependencies(api))).toMatchObject([{ modelId: 'qwen-embedding', type: 'embedding', vendorMetadata: { privacy: 'private' } }])
})
it('serializes native Venice reasoning effort and thinking disable through the SDK transport', async () => {
  const api = vi.fn().mockResolvedValue(json({ id: 'test', model: 'reasoner', created: 1, choices: [{ index: 0, message: { role: 'assistant', content: 'answer' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))
  const model = new Venice({ apiKey: 'test', apiHost: 'https://api.venice.ai/api/v1', model: { modelId: 'reasoner', providerId: 'venice', capabilities: ['reasoning'], vendorMetadata: { capabilities: { supportsReasoningEffort: true, reasoningEffortOptions: ['high', 'max'] } } }, stream: false }, dependencies(api))
  await model.chat([{ role: 'user', content: 'test' }], { providerOptions: { openaiCompatible: { reasoningEffort: 'max' } } })
  expect(JSON.parse(String(api.mock.calls[0][0].body))).toMatchObject({ reasoning_effort: 'max' })
})

it('uses Venice embeddings directly through the same SDK adapter used by RAG', async () => {
  class EmbeddingVenice extends Venice { embedding() { return this.getTextEmbeddingModel({})! } }
  const api = vi.fn().mockResolvedValue(json({ data: [{ object: 'embedding', embedding: [0.1, 0.2], index: 0 }], model: 'qwen-embedding', usage: { prompt_tokens: 2, total_tokens: 2 } }))
  const model = new EmbeddingVenice({ apiKey: 'test', apiHost: 'https://api.venice.ai/api/v1', model: { modelId: 'qwen-embedding', type: 'embedding' } }, dependencies(api))
  const result = await embed({ model: model.embedding(), value: 'test document' })
  expect(result.embedding).toEqual([0.1, 0.2])
  expect(api.mock.calls[0][0]).toMatchObject({ url: 'https://api.venice.ai/api/v1/embeddings', useProxy: false })
})

it('retains the direct Venice search tool through Chatbox active-tool preparation',async()=>{
 let completions=0
 const api=vi.fn(async(request:import('../../../types/adapters').ApiRequestOptions)=>{
  if(request.url.endsWith('/augment/search'))return json({results:[{title:'Verified source',url:'https://example.com',content:'Current information'}]})
  const body=JSON.parse(String(request.body));expect(body.tools.some((entry:{function:{name:string}})=>entry.function.name==='venice_web_search')).toBe(true)
  const part=completions++===0?{tool_calls:[{index:0,id:'call-search',type:'function',function:{name:'venice_web_search',arguments:'{"query":"latest information"}'}}]}:{content:'Source: https://example.com'}
  const reason=completions===1?'tool_calls':'stop'
  return new Response(`data: ${JSON.stringify({id:'stream',model:'chat',created:1,choices:[{index:0,delta:part,finish_reason:null}]})}\n\ndata: ${JSON.stringify({choices:[{index:0,delta:{},finish_reason:reason}]})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}})
 })
 const model=new Venice({apiKey:'synthetic',apiHost:'https://api.venice.ai/api/v1',model:{modelId:'chat',capabilities:['tool_use']},venice:{webSearch:'auto',searchProvider:'brave'}},dependencies(api))
 const parts=[];for await(const part of model.chatStream([{role:'user',content:'Find the latest information'}],{maxSteps:3,prepareStep:async()=>({activeTools:[]})}))parts.push(part)
 expect(api.mock.calls.some(([request])=>request.url.endsWith('/augment/search'))).toBe(true);expect(parts.some(part=>part.type==='tool-result')).toBe(true)
})
