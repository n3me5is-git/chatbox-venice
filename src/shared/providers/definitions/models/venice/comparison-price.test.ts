import { describe, expect, it } from 'vitest'
import { mediaComparisonPrice } from './comparison-price'

describe('comparable media price indices', () => {
  it('uses an actual reference quote at 720p/5s and labels nonstandard resolutions honestly', () => {
    expect(mediaComparisonPrice({ id: 'wan-2.5-preview-text-to-video', type: 'video' })).toMatchObject({ amount: 0.55, basis: 'video', resolution: '720p', sourceSeconds: 5, normalized: false })
    expect(mediaComparisonPrice({ id: 'kling-v3-4k-text-to-video', type: 'video' })).toMatchObject({ resolution: 'default' })
  })
  it('charges the applicable audio tier rather than half a one-minute tier', () => {
    expect(mediaComparisonPrice({ id: 'elevenlabs-music', type: 'music', model_spec: { pricing: { durations: { 60: { usd: 0.69, min_seconds: 3, max_seconds: 60 } } } } })).toMatchObject({ amount: 0.69, basis: 'audio' })
    expect(mediaComparisonPrice({ id: 'ace-step-15', type: 'music' })).toMatchObject({ amount: 0.015, normalized: true, sourceSeconds: 60 })
  })
  it('estimates voice by characters, preserves known per-second rates and labels fixed tracks', () => {
    expect(mediaComparisonPrice({ id: 'voice', type: 'tts', model_spec: { pricing: { input: { usd: 10 } } } })).toMatchObject({ amount: 0.00413, speechEstimate: true, basis: 'audio' })
    expect(mediaComparisonPrice({ id: 'transcribe', type: 'asr', model_spec: { pricing: { per_audio_second: { usd: 0.01 } } } })).toMatchObject({ amount: 0.3 })
    expect(mediaComparisonPrice({ id: 'minimax-music-v2', type: 'music' })).toMatchObject({ amount: 0.04, basis: 'track' })
  })
  it('does not invent source-dependent prices or apply media indices to chat and images', () => {
    expect(mediaComparisonPrice({ id: 'minimax-h3-max-recast', type: 'video' })).toBeUndefined()
    expect(mediaComparisonPrice({ id: 'unknown', type: 'video' })).toBeUndefined()
    expect(mediaComparisonPrice({ id: 'tts-qwen3-1-7b', type: 'text' })).toBeUndefined()
  })
})
