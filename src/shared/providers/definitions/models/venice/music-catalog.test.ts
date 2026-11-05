import { describe, expect, it } from 'vitest'
import fixture from '../../../../../../test/fixtures/venice/music-catalog.json'
import { musicDuration, musicOptions, validateMediaRequest } from './media-capabilities'
import type { MediaCatalogItem } from './media'
describe('published Venice music model metadata (no live inference)', () => {
  for (const row of fixture.data as MediaCatalogItem[]) it(`builds compatible defaults for ${row.id}`, () => {
    const spec = row.model_spec!; const duration = musicDuration(row)
    const prompt = 'Create a calm cinematic instrumental soundscape with soft piano and warm strings.'
    const options = musicOptions(row, { seconds: duration.default ?? duration.choices[0] ?? duration.min, instrumental: false, lyrics: spec.lyrics_required ? 'Walking through the quiet city, watching all the stars above.' : '', voice: spec.default_voice })
    expect(() => validateMediaRequest('music', { model: row.id, prompt, ...options }, row)).not.toThrow()
    if (spec.supports_force_instrumental !== true) expect(options).not.toHaveProperty('force_instrumental')
  })
})

