import { describe, expect, it } from 'vitest'
import { VeniceSettingsSchema } from '../../../../types/settings'
import { resolveVeniceSettings } from './options'
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
})
