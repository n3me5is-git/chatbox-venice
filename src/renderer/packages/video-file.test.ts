// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest'
import {videoFileDuration} from './video-file'

afterEach(()=>vi.restoreAllMocks())
function fixture(){
 const video=document.createElement('video'),create=document.createElement.bind(document)
 vi.spyOn(document,'createElement').mockImplementation(((tag:string)=>tag==='video'?video:create(tag)) as typeof document.createElement)
 Object.defineProperty(URL,'createObjectURL',{configurable:true,writable:true,value:vi.fn(()=> 'blob:local-video-metadata')})
 Object.defineProperty(URL,'revokeObjectURL',{configurable:true,writable:true,value:vi.fn()})
 vi.spyOn(video,'load').mockImplementation(()=>{})
 return video
}
describe('local video duration inspection',()=>{
 it('reads metadata without decoding the file and releases the local URL',async()=>{
  const video=fixture(),file=new File(['container'],'clip.mp4',{type:'video/mp4'})
  const read=vi.spyOn(file,'arrayBuffer')
  const pending=videoFileDuration(file)
  Object.defineProperty(video,'duration',{value:5.2});video.dispatchEvent(new Event('loadedmetadata'))
  await expect(pending).resolves.toBe(5.2)
  expect(read).not.toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-video-metadata');expect(video.getAttribute('src')).toBeNull();expect(video.onloadedmetadata).toBeNull()
 })
 it('releases the media when inspection is canceled',async()=>{
  const video=fixture(),controller=new AbortController(),pending=videoFileDuration(new File(['x'],'clip.mp4'),controller.signal)
  controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'})
  expect(URL.revokeObjectURL).toHaveBeenCalled();expect(video.getAttribute('src')).toBeNull()
 })
 it('rejects unknown or unbounded duration instead of sending a misleading quote',async()=>{
  const video=fixture(),pending=videoFileDuration(new File(['x'],'clip.mp4'))
  Object.defineProperty(video,'duration',{value:Infinity});video.dispatchEvent(new Event('loadedmetadata'))
  await expect(pending).rejects.toThrow('duration');expect(URL.revokeObjectURL).toHaveBeenCalled()
 })
})
