import { describe, expect, it, vi } from 'vitest'
import { ProviderModelInfoSchema } from '@shared/types'
import type { ModelDependencies } from '../../types/adapters'
import { mergeExtraBody, parseExtraBody, withExtraBody } from './extra-body'

describe('per-model extra request JSON', () => {
  it('preserves vendor settings through saved models and backups', () => {
    const model = { modelId: 'private-search', extraBody: { model: 'actual-model', venice_parameters: { enable_web_search: 'auto' }, moderation: 'low' }, nativeWebSearch: true }
    expect(ProviderModelInfoSchema.parse(JSON.parse(JSON.stringify(model)))).toMatchObject(model)
  })
  it('merges nested options without losing generated fields and replaces arrays', () => {
    const original = { model: 'local-alias', messages: [{ role: 'user', content: 'hello' }], settings: { a: 1, b: 2 }, tools: [1, 2] }
    expect(mergeExtraBody(original, { model: 'remote-id', settings: { b: 3 }, tools: [3], moderation: 'low' })).toEqual({ ...original, model: 'remote-id', settings: { a: 1, b: 3 }, tools: [3], moderation: 'low' })
    expect(original.settings.b).toBe(2)
  })
  it.each(['[]', 'null', '1', '"text"', '{broken}', '{"stream":false}', '{"__proto__":{"polluted":true}}'])('rejects invalid settings %s', (text) => {
    expect(() => parseExtraBody(text)).toThrow()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('clears the override when the editor is empty', () => expect(parseExtraBody('  ')).toBeUndefined())
  it('adds settings to JSON POST requests, preserves cancellation and leaves model discovery untouched', async () => {
    const apiRequest = vi.fn().mockResolvedValue(new Response('{}'))
    const dependencies = { request: { apiRequest } } as unknown as ModelDependencies
    const wrapped = withExtraBody(dependencies, { moderation: 'low', venice_parameters: { enable_web_search: 'on' } })
    const signal = new AbortController().signal
    await wrapped.request.apiRequest({ url: 'https://vendor.test/images/generations', method: 'POST', signal, retry: 0, body: '{"prompt":"private prompt","model":"image-model"}' })
    const sent = apiRequest.mock.calls[0][0]
    expect(sent.signal).toBe(signal)
    expect(sent.retry).toBe(0)
    expect(JSON.parse(sent.body)).toEqual({ prompt: 'private prompt', model: 'image-model', moderation: 'low', venice_parameters: { enable_web_search: 'on' } })
    const lookup = { url: 'https://vendor.test/models', method: 'GET' }
    await wrapped.request.apiRequest(lookup)
    expect(apiRequest.mock.calls[1][0]).toBe(lookup)
  })
  it('preserves uploaded files while adding image-edit form options', async () => {
    const apiRequest = vi.fn().mockResolvedValue(new Response('{}'))
    const dependencies = { request: { apiRequest } } as unknown as ModelDependencies
    const wrapped = withExtraBody(dependencies, { moderation: 'low', n: 1 })
    const body = new FormData()
    body.set('image', new Blob(['image'], { type: 'image/png' }), 'input.png')
    await wrapped.request.apiRequest({ url: 'https://vendor.test/images/edits', method: 'POST', body })
    const sent = apiRequest.mock.calls[0][0].body as FormData
    expect(sent.get('moderation')).toBe('low')
    expect(sent.get('n')).toBe('1')
    expect(sent.get('image')).toBeInstanceOf(Blob)
    expect(body.get('moderation')).toBeNull()
  })
})
