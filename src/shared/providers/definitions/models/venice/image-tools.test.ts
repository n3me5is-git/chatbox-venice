import { describe, expect, it, vi } from 'vitest'
import { buildVeniceImageTools } from './image-tools'
import type { VeniceOptions } from './options'
function setup() {
  const host = { models: vi.fn(async () => [{ modelId: 'model', name: 'Model' }, { modelId: 'user-choice', name: 'Chosen model' }]), previous: vi.fn(async (): Promise<unknown | null> => null), status: vi.fn(async () => ({ status: 'done' })), generate: vi.fn(async () => ({ recordId: 'saved' })), choose: vi.fn(async (): Promise<import('./image-tools').ImageChoice | null> => ({ modelId: 'user-choice', prompt: 'edited by user', count: 2, aspectRatio: '1:1', referenceImages: [] })) }
  const options: VeniceOptions = {}; const tools = buildVeniceImageTools(host, () => options)
  const call = (input: unknown, signal?: AbortSignal) => (tools.venice_image.execute as unknown as (input: unknown, context: { toolCallId: string; messages: never[]; abortSignal?: AbortSignal }) => Promise<unknown>)(input, { toolCallId: 'call', messages: [], abortSignal: signal })
  return { host, options, call }
}
describe('Venice native image tools', () => {
  it('always lets the user select a model and approve the exact batch', async () => { const s = setup(); await s.call({ action: 'generate', model: 'model', prompt: 'suggestion' }); expect(s.host.choose).toHaveBeenCalledOnce(); expect(s.host.generate).toHaveBeenCalledWith(expect.objectContaining({ modelId: 'user-choice', prompt: 'edited by user', count: 2 }), 'call') })
  it('does not charge when the user cancels', async () => { const s = setup(); s.host.choose.mockResolvedValue(null); expect(await s.call({ action: 'generate', prompt: 'a scene' })).toMatchObject({ cancelled: true, message:expect.stringContaining('Do not retry') }); expect(s.host.generate).not.toHaveBeenCalled() })
  it('rechecks provider disable and abort after confirmation', async () => { const s = setup(); s.host.choose.mockImplementationOnce(async () => { s.options.enabled = false; return { modelId: 'model', prompt: 'x', count: 1, aspectRatio: 'auto', referenceImages: [] } }); await expect(s.call({ action: 'generate', prompt: 'scene' })).rejects.toThrow('disabled'); expect(s.host.generate).not.toHaveBeenCalled() })
  it('reuses the existing tool call record without confirmation or paid replay', async () => { const s = setup(); s.host.previous.mockResolvedValue({ recordId: 'existing' }); expect(await s.call({ action: 'generate', prompt: 'scene' })).toEqual({ recordId: 'existing' }); expect(s.host.choose).not.toHaveBeenCalled(); expect(s.host.generate).not.toHaveBeenCalled() })
})
