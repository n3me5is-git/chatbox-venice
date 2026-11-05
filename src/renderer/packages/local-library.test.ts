// @vitest-environment jsdom
import { describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),getPage:vi.fn(),list:vi.fn()}))
vi.mock('@/platform',()=>({default:{getImageGenerationStorage:()=>({initialize:async()=>{},getPage:mocks.getPage}),listStoreBlobKeys:async()=>[]}}))
vi.mock('@/adapters/CurrentBlobStorage',()=>({currentBlobStorage:{get:mocks.get}}))
vi.mock('@/packages/venice/service',()=>({veniceMediaService:{list:mocks.list}}))
import { acceptsLocalFile,localLibraryFile,localLibraryPage } from './local-library'
describe('local library reads selected content only',()=>{
 it('keeps protected image sessions and audio out of the public legacy tabs even while unlocked',async()=>{mocks.getPage.mockResolvedValue({items:[{id:'secret',prompt:'Private',protection:'app',generatedImages:['private-key']},{id:'ordinary',prompt:'Public',generatedImages:['public-key']}],nextCursor:null});expect((await localLibraryPage('image')).items.map(item=>item.key)).toEqual(['public-key']);mocks.list.mockResolvedValue([{id:'secret',kind:'speech',prompt:'Private',protection:'app',status:'ready',blobKey:'private-audio'},{id:'ordinary',kind:'speech',prompt:'Public',status:'ready',blobKey:'public-audio'}]);expect((await localLibraryPage('audio')).items.map(item=>item.key)).toEqual(['public-audio'])})
 it('lists an image page without reading image bytes',async()=>{
  mocks.get.mockClear();mocks.getPage.mockResolvedValue({items:[{id:'one',prompt:'Sunset',generatedImages:['saved-key'],generatedImageThumbnails:['thumb-key']}],nextCursor:20})
  const page=await localLibraryPage('image');expect(page.items[0]).toMatchObject({key:'saved-key',thumbnail:'thumb-key'});expect(page.next).toBe(20);expect(mocks.get).not.toHaveBeenCalled()
 })
 it('creates a device-local File from the selected bytes without remote fetching',async()=>{
  mocks.get.mockResolvedValue('data:audio/wav;base64,YXVkaW8=')
  const file=await localLibraryFile({id:'audio-one',name:'A sound',kind:'audio',key:'stored'})
  expect(file.type).toBe('audio/wav');expect(file.size).toBe(5);expect(acceptsLocalFile(file,'.wav,.mp3')).toBe(true);expect(acceptsLocalFile(file,'image/*')).toBe(false)
 })
 it('rejects URLs and missing content rather than downloading silently',async()=>{
  mocks.get.mockResolvedValue('https://external.example/private.png')
  await expect(localLibraryFile({id:'one',name:'Image',kind:'image',key:'stored'})).rejects.toThrow('on-device')
  mocks.get.mockResolvedValue(null);await expect(localLibraryFile({id:'one',name:'Image',kind:'image',key:'stored'})).rejects.toThrow('no longer')
 })
})
