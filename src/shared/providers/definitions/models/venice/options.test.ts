import { describe, expect, it } from 'vitest'
import { SessionSettingsSchema, VeniceSettingsSchema } from '../../../../types/settings'
import { resolveVeniceSettings } from './options'
import Venice from '../venice'
import type { ModelDependencies } from '../../../../types/adapters'
describe('Venice profile precedence and settings isolation', () => {
  it('retains false values and merges nested image options across preset, model and chat', () => {
    const result = resolveVeniceSettings({ webSearch: 'off', imageSafeMode: true, image: { width: 512, height: 512 }, profiles: [{ id: 'research', name: 'Research', options: { webSearch: 'on', searchProvider: 'brave', imageSafeMode: false, image: { width: 1024 } } }] }, { profileId: 'research', webSearch: 'auto' }, { webSearch: 'off', image: { seed: 0 } })
    expect(result).toMatchObject({ webSearch: 'off', searchProvider: 'brave', imageSafeMode: false, image: { width: 1024, height: 512, seed: 0 } })
  })
  it('cleared override fields inherit instead of erasing provider values', () => {
    expect(resolveVeniceSettings({ webSearch: 'on', image: { width: 1024 } }, { webSearch: undefined, image: { width: undefined } })).toMatchObject({ webSearch: 'on', image: { width: 1024 } })
  })
  it('never grants module permissions through a preset or chat override', () => {
    const hostile = { enabled: true, audioEnabled: true, chatToolsEnabled: true }
    const result = resolveVeniceSettings({ enabled: false, audioEnabled: false, chatToolsEnabled: false }, { ...hostile, webSearch: 'off' })
    expect(result).toMatchObject({ enabled: false, audioEnabled: false, chatToolsEnabled: false })
  })
  it('falls back to provider defaults when a referenced preset is deleted', () => {
    expect(resolveVeniceSettings({ webSearch: 'off' }, { profileId: 'deleted', webCitations: false })).toMatchObject({ webSearch: 'off', webCitations: false })
  })
  it('round-trips profiles and optional flags while old provider settings remain valid', () => {
    expect(VeniceSettingsSchema.parse({ webSearch: 'auto' })).toEqual({ webSearch: 'auto' })
    const settings = { enabled: false, musicEnabled: true, profiles: [{ id: 'p', name: 'Preset', options: { imageSafeMode: false } }] }
    expect(VeniceSettingsSchema.parse(settings)).toEqual(settings)
  })

  it('persists independent search controls and encrypted tool consent without granting it through profiles', () => {
    const settings = {
      webSearch: 'auto', webSearchEnabled: false, searchToolMode: 'separate',
      e2eeToolsEnabled: true, e2eeToolMode: 'encrypted-text', secureReceiptCompatibility: true,
      profiles: [{ id: 'p', name: 'Research', options: { searchToolMode: 'selected', webSearchEnabled: true } }],
    }
    expect(VeniceSettingsSchema.parse(settings)).toEqual(settings)
    const hostile = { e2eeToolsEnabled: true, e2eeToolMode: 'native', secureReceiptCompatibility: true } as never
    expect(resolveVeniceSettings({ e2eeToolsEnabled: false, e2eeToolMode: 'encrypted-text', secureReceiptCompatibility: false }, hostile, hostile))
      .toMatchObject({ e2eeToolsEnabled: false, e2eeToolMode: 'encrypted-text', secureReceiptCompatibility: false })
  })

  it('round-trips chat security separately from model and search profiles', () => {
    const security = { textPrivacy: 'e2ee', e2eeToolsEnabled: true, e2eeToolMode: 'encrypted-text', secureReceiptCompatibility: false }
    const parsed = SessionSettingsSchema.parse(JSON.parse(JSON.stringify({ veniceSecurity: security, veniceProfile: security })))
    expect(parsed.veniceSecurity).toEqual(security)
    expect(parsed.veniceProfile).toEqual({})
    expect(SessionSettingsSchema.parse({}).veniceSecurity).toBeUndefined()
  })

  it('isolates explicit chat overrides and retains provider-only module and catalog restrictions', () => {
    const base = { textPrivacy: 'e2ee' as const, e2eeToolsEnabled: true, secureReceiptCompatibility: true, privacyFilter: 'private' as const, audioEnabled: false }
    const chat = resolveVeniceSettings(base, undefined, undefined, { textPrivacy: 'standard', e2eeToolsEnabled: false, secureReceiptCompatibility: false, audioEnabled: true, privacyFilter: 'all' } as never)
    expect(chat).toMatchObject({ textPrivacy: 'standard', e2eeToolsEnabled: false, secureReceiptCompatibility: false, privacyFilter: 'private', audioEnabled: false })
    expect(resolveVeniceSettings(base)).toEqual(base)
    expect(base.textPrivacy).toBe('e2ee')
  })

  it('blocks an incompatible model before network use while allowing an explicit HTTPS chat override', () => {
    const base = { textPrivacy: 'e2ee' as const }
    const model = { modelId: 'ordinary-chat', type: 'chat' as const, vendorMetadata: { privacy: 'private' } }
    const dependencies = {} as ModelDependencies
    const options = { apiKey: 'synthetic', apiHost: 'https://api.venice.ai/api/v1', model, customFetch: globalThis.fetch }
    expect(() => new Venice({ ...options, venice: resolveVeniceSettings(base) }, dependencies)).toThrow('TEE support')
    expect(() => new Venice({ ...options, venice: resolveVeniceSettings(base, undefined, undefined, { textPrivacy: 'standard' }) }, dependencies)).not.toThrow()
    expect(() => new Venice({ ...options, venice: resolveVeniceSettings({ ...base, privacyFilter: 'tee' }, undefined, undefined, { textPrivacy: 'standard' }) }, dependencies)).toThrow('Privacy Only')
  })
})
