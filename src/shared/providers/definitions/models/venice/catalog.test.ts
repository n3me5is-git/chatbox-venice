import { describe, expect, it } from 'vitest'
import { audioFormats, friendlyMediaError, quoteLabel, supportedValues, voiceChoices } from './catalog'
describe('User-facing Venice catalog', () => {
  it('uses only advertised voices, identifies Kokoro language and marks the model default', () => {
    expect(voiceChoices({ id: 'tts-kokoro', type: 'tts', model_spec: { voices: ['if_sara', 'im_nicola', 'if_sara'], default_voice: 'if_sara' } })).toEqual([{ value: 'if_sara', label: 'Sara · Italian · Recommended' }, { value: 'im_nicola', label: 'Nicola · Italian' }])
    expect(voiceChoices({ id: 'unknown', type: 'tts' })).toEqual([])
  })
  it('does not carry a voice list or formats across models', () => {
    expect(voiceChoices({ id: 'tts-second', type: 'tts', model_spec: { voices: ['Vivian'], default_voice: 'Vivian' } })).toEqual([{ value: 'Vivian', label: 'Vivian · Recommended' }])
    expect(audioFormats({ id: 'tts', type: 'tts', model_spec: { supported_formats: ['wav', 'wav', 'html'] } })).toEqual(['wav'])
    expect(audioFormats()).toEqual([])
  })
  it('reads model-specific duration and layout choices without inventing a model list', () => {
    expect(supportedValues({ id: 'video', type: 'video', model_spec: { constraints: { duration: { enum: ['4s', '8s'] } } } }, 'duration')).toEqual(['4s', '8s'])
    expect(supportedValues(undefined, 'duration')).toEqual([])
  })
  it('formats a server quote in USD and rejects malformed costs', () => {
    expect(quoteLabel({ quote: 0.75 })).toContain('0.75')
    expect(quoteLabel({ quote: 0.75 })).toContain('
    expect(() => quoteLabel({ quote: '0.75' })).toThrow('valid cost')
    expect(() => quoteLabel({ quote: -1 })).toThrow()
  })
  it('shows actionable errors instead of raw API details', () => {
    expect(friendlyMediaError('HTTP 429')).toContain('Wait')
    expect(friendlyMediaError('API Error: Status Code 401')).toContain('key')
    expect(friendlyMediaError('Enter a JSON object')).toContain('advanced parameters')
  })
})
)
    expect(() => quoteLabel({ quote: '0.75' })).toThrow('valid cost')
    expect(() => quoteLabel({ quote: -1 })).toThrow()
  })
  it('shows actionable errors instead of raw API details', () => {
    expect(friendlyMediaError('HTTP 429')).toContain('Wait')
    expect(friendlyMediaError('API Error: Status Code 401')).toContain('key')
    expect(friendlyMediaError('Enter a JSON object')).toContain('advanced parameters')
  })
})
