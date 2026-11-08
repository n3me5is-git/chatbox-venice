import { describe, expect, it, vi } from 'vitest'
import type { ToolSet } from 'ai'
import { buildVeniceMediaTools } from './tools'
import type { VeniceMediaService, MediaRecord } from './media'
import type { VeniceOptions } from './options'
const record = { id: 'mine', kind: 'speech', model: 'tts', prompt: 'private', createdAt: 1, sessionId: 'chat', status: 'ready', credentialId: 'secret-hash', origin: 'https://api.venice.ai/api/v1' } satisfies MediaRecord
function setup() {
  const service = { waitFor:vi.fn().mockResolvedValue({record,timedOut:false}), catalog: vi.fn(), list: vi.fn().mockResolvedValue([record, { ...record, id: 'other', sessionId: 'different-chat' }]), quote: vi.fn().mockResolvedValue({ quote: 1 }), start: vi.fn().mockResolvedValue(record), resume: vi.fn(), pause: vi.fn(), remove: vi.fn(), cleanup: vi.fn() }
  const settings: VeniceOptions = { chatToolsEnabled: true, audioEnabled: true }; const confirm = vi.fn().mockResolvedValue(true)
  const tools = buildVeniceMediaTools('chat', service as unknown as VeniceMediaService, () => settings, confirm)
  const call = (input: unknown, signal?: AbortSignal) => (tools.venice_media.execute as Function)(input, { abortSignal: signal, toolCallId: 'test', messages: [] })
  return { service, settings, confirm, tools, call }
}
describe('Venice chat media tools', () => {
  it('waits for the existing chat-scoped job without approval or another paid submission',async()=>{const s=setup(),abort=new AbortController();expect(await s.call({action:'wait',id:'mine',timeout_seconds:45},abort.signal)).toMatchObject({id:'mine',waitTimedOut:false,artifact:{type:'venice_media',recordId:'mine'}});expect(s.service.waitFor).toHaveBeenCalledWith('mine',45000,abort.signal);expect(s.confirm).not.toHaveBeenCalled();expect(s.service.start).not.toHaveBeenCalled();expect(s.service.resume).not.toHaveBeenCalled()})
  it('rejects waiting on other chats and invalid timeouts',async()=>{const s=setup();await expect(s.call({action:'wait',id:'other'})).rejects.toThrow('this chat');await expect(s.call({action:'wait',id:'mine',timeout_seconds:61})).rejects.toThrow('60 seconds');expect(s.service.waitFor).not.toHaveBeenCalled()})
  it('rechecks disabled settings after waiting, before returning any saved result',async()=>{const s=setup();s.service.waitFor.mockImplementationOnce(async()=>{s.settings.enabled=false;return {record,timedOut:false}});await expect(s.call({action:'wait',id:'mine'})).rejects.toThrow('disabled')})
  it('recalls a saved artifact without generating or exposing its storage location',async()=>{const s=setup();expect(await s.call({action:'show',id:'mine'})).toMatchObject({artifact:{type:'venice_media',recordId:'mine'}});expect(s.service.start).not.toHaveBeenCalled();expect(s.confirm).not.toHaveBeenCalled()})
  it('can explicitly disable the internal tools', () => {
    expect(buildVeniceMediaTools('chat', {} as VeniceMediaService, () => ({ chatToolsEnabled: false }), vi.fn())).toEqual({})
  })
  it('lists only this chat and omits credential, endpoint and prompt metadata', async () => {
    const s = setup(); const result = await s.call({ action: 'list' })
    expect(result).toHaveLength(1); expect(result[0].id).toBe('mine'); expect(JSON.stringify(result)).not.toMatch(/secret-hash|private|api\.venice/)
  })
  it('rejects access to another chat even with a known identifier', async () => {
    const s = setup(); await expect(s.call({ action: 'delete_local', id: 'other' })).rejects.toThrow('this chat'); expect(s.service.remove).not.toHaveBeenCalled()
  })
  it('requires confirmation for paid generation, carries session scope, and cancels cleanly', async () => {
    const s = setup(); s.confirm.mockResolvedValueOnce(false)
    expect(await s.call({ action: 'generate', kind: 'speech', model: 'tts', prompt: 'hello' })).toMatchObject({ cancelled: true, message:expect.stringContaining('Do not retry') }); expect(s.service.start).not.toHaveBeenCalled()
    await s.call({ action: 'generate', kind: 'speech', model: 'tts', prompt: 'hello', extra_json: '{"speed":0.8}' })
    expect(s.service.start).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'chat', options: { speed: 0.8 } }))
  })
  it('rechecks disable and abort after the approval dialog before making a paid request', async () => {
    const s = setup(); s.confirm.mockImplementationOnce(async () => { s.settings.enabled = false; return true })
    await expect(s.call({ action: 'generate', kind: 'speech', model: 'tts', prompt: 'hello' })).rejects.toThrow('disabled'); expect(s.service.start).not.toHaveBeenCalled()
    s.settings.enabled = true; const abort = new AbortController(); s.confirm.mockImplementationOnce(async () => { abort.abort(); return true })
    await expect(s.call({ action: 'generate', kind: 'speech', model: 'tts', prompt: 'hello' }, abort.signal)).rejects.toThrow(); expect(s.service.start).not.toHaveBeenCalled()
  })
  it('requires confirmation for deletion even when paid-generation confirmation is disabled', async () => {
    const s = setup(); s.settings.confirmMediaTools = false; s.confirm.mockResolvedValue(false)
    await s.call({ action: 'cleanup_remote', id: 'mine' }); expect(s.confirm).toHaveBeenCalledTimes(1); expect(s.service.cleanup).not.toHaveBeenCalled()
  })
  it('uses chat approvals even when an old provider-wide bypass is present', async () => { const s=setup(); s.settings.confirmMediaTools=false; s.confirm.mockResolvedValue(false); expect(await s.call({action:'generate',kind:'speech',model:'tts',prompt:'hello'})).toMatchObject({cancelled:true}); expect(s.service.start).not.toHaveBeenCalled() })
  it('supports the default enabled tool policy', async () => {const s=setup(); delete s.settings.chatToolsEnabled; await s.call({action:'list'}); expect(s.service.list).toHaveBeenCalled()})
  it('rejects malformed JSON before approval or generation', async () => {
    const s = setup(); await expect(s.call({ action: 'generate', kind: 'video', model: 'video', prompt: 'hello', extra_json: '[]' })).rejects.toThrow('JSON object'); expect(s.confirm).not.toHaveBeenCalled(); expect(s.service.start).not.toHaveBeenCalled()
  })
})
