import { veniceModelPage } from './model-variant'
import { describe, expect, it } from 'vitest'
import fixture from '../../../../../../test/fixtures/venice/catalog-2026-11-08.json'
import flags from '../../../../../../test/fixtures/venice/video-flags-docs-2026-11-08.json'
import type { MediaCatalogItem } from './media'
import { videoVariant, videoModelDocumentation } from './model-variant'
import { privacyLabels, videoWorkflows, videoWorkflowRequest, validateMediaRequest } from './media-capabilities'

describe('Venice video variants with repeated names', () => {
  const models = fixture.models as MediaCatalogItem[]
  it('distinguishes every Seedance route, including references reported as image-to-video', () => {
    for (const model of models.filter(row => row.id.startsWith('seedance-'))) {
      expect(videoVariant(model), model.id).toBe(model.id.includes('reference-to-video') ? 'References to video' : model.id.includes('text-to-video') ? 'Text to video' : model.id.includes('image-to-video') ? 'Image to video' : 'Video editing')
    }
  })
  it('keeps filter status from the catalog instead of inheriting it from another version', () => {
    for (const model of models.filter(row => row.id.startsWith('seedance-2-'))) expect(privacyLabels(model.model_spec).some(row => row.label === 'Uncensored'), model.id).toBe(false)
    expect(privacyLabels(models.find(row => row.id === 'seedance-1-5-pro-text-to-video-basic')!.model_spec).some(row => row.label === 'Uncensored')).toBe(true)
  })
  it('matches the official documentation explorer on all 142 video filter and privacy flags',()=>{
    expect(flags).toHaveLength(142)
    expect(flags.filter(row=>row.apiUncensored)).toHaveLength(43)
    for(const row of flags){expect(row.docsPresent,row.id).toBe(true);expect(row.apiUncensored,row.id).toBe(row.docsUncensored);expect(row.apiPrivacy,row.id).toBe(row.docsPrivacy)}
  })
  it('links exact variants to their actual documentation family instead of a missing page',()=>{
    for(const model of models.filter(row=>row.type==='video'))expect(videoModelDocumentation(model),model.id).toContain('?v='+encodeURIComponent(model.id))
    expect(videoModelDocumentation({id:'new-video',type:'video'})).toBe('https://docs.venice.ai/models/video')
  })
  it('offers Seedance R2V as an editing workflow while honoring the separate video_url flag',()=>{
    const m=models.find(row=>row.id==='seedance-2-5-reference-to-video-basic')!
    expect(videoWorkflows(m)).toEqual(['references','edit'])
    const request=videoWorkflowRequest(m,'edit','change the sky to sunset')
    expect(request).toEqual({prompt:'Strictly edit <Video 1>, change the sky to sunset',options:{aspect_ratio:'adaptive',duration:'auto',omni_reference_task_type:'edit'}})
    expect(()=>validateMediaRequest('video',{...request.options,prompt:request.prompt,reference_video_urls:['data:video/mp4;base64,AA==']},m)).not.toThrow()
    expect(()=>validateMediaRequest('video',{...request.options,prompt:request.prompt,video_url:'data:video/mp4;base64,AA=='},m)).toThrow()
    expect(()=>validateMediaRequest('video',{duration:'4s',aspect_ratio:'16:9',image_url:'data:image/png;base64,AA=='},models.find(row=>row.id==='seedance-2-0-image-to-video-basic')!)).toThrow('aspect_ratio')
  })
  it('treats an optional Seedance end frame separately from mandatory transition frames',()=>{
    const m=models.find(row=>row.id==='seedance-2-0-image-to-video-basic')!
    expect(()=>validateMediaRequest('video',{duration:'4s',image_url:'data:image/png;base64,AA=='},m)).not.toThrow()
  })
})

it('opens public family cards while preserving the E2EE-specific model card',()=>{expect(veniceModelPage('kling-v3-4k-text-to-video')).toBe('https://venice.ai/models/kling-v3-4k');expect(veniceModelPage('e2ee-deepseek-v4-flash')).toBe('https://venice.ai/models/e2ee-deepseek-v4-flash')})
