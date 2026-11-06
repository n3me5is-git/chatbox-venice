import { describe,expect,it,vi } from 'vitest'
import { processVeniceImage } from './image-processing'
function fixture(){
 const png=new Uint8Array(24);png.set([137,80,78,71]);const view=new DataView(png.buffer);view.setUint32(16,256);view.setUint32(20,256)
 const input={file:new File([png],'source.png',{type:'image/png'}),operation:'background-remove' as const,title:'Remove background',protection:'app'}
 const store={ensure:vi.fn().mockResolvedValue(undefined),create:vi.fn().mockResolvedValue(undefined),update:vi.fn().mockResolvedValue(undefined),save:vi.fn().mockResolvedValue('saved-result')}
 const request=vi.fn().mockResolvedValue(new Response(png,{headers:{'content-type':'image/png'}}))
 return {input,store,request,config:{apiKey:'synthetic',options:{enabled:true}},signal:new AbortController().signal}
}
describe('Venice image processing without paid live calls',()=>{
 it('uses multipart background removal once and retains protection in metadata and the saved output',async()=>{
  const f=fixture();const record=await processVeniceImage(f.input,f.config,f.store,f.request,f.signal)
  expect(f.request).toHaveBeenCalledTimes(1);expect(f.request.mock.calls[0][0]).toMatchObject({url:'https://api.venice.ai/api/v1/image/background-remove',retry:0,useProxy:false})
  const body=f.request.mock.calls[0][0].body as FormData;expect(body.get('image')).toBeInstanceOf(File);expect(body.get('anon_user_id')).toBeNull();expect(body.get('model')).toBeNull()
  expect(f.store.ensure).toHaveBeenCalledWith('app');expect(f.store.create).toHaveBeenCalledWith(expect.objectContaining({protection:'app'}));expect(f.store.save.mock.calls[0][0]).toMatchObject({protection:'app'})
  expect(record).toMatchObject({status:'done',protection:'app',generatedImages:['saved-result']})
 })
 it('uses the dedicated upscale endpoint with explicit options, preserving zero creativity',async()=>{
  const f=fixture();await processVeniceImage({...f.input,operation:'upscale',scale:4,creativity:0},f.config,f.store,f.request,f.signal)
  const request=f.request.mock.calls[0][0];expect(request.url).toMatch(/\/image\/upscale$/);expect(request.body.get('scale')).toBe('4');expect(request.body.get('creativity')).toBe('0')
 })
 it('fails before billing when storage, dimensions or privacy checks fail',async()=>{
  const f=fixture();f.store.ensure.mockRejectedValueOnce(Error('Device encryption unavailable'))
  await expect(processVeniceImage(f.input,f.config,f.store,f.request,f.signal)).rejects.toThrow('encryption')
  await expect(processVeniceImage({...f.input,operation:'upscale',scale:3 as 2},f.config,f.store,f.request,f.signal)).rejects.toThrow('options')
  await expect(processVeniceImage(f.input,{...f.config,options:{privacyFilter:'private'}},f.store,f.request,f.signal)).rejects.toThrow()
  expect(f.request).not.toHaveBeenCalled()
 })
 it('records HTTP failure without replaying the paid action and rejects non-image results',async()=>{
  const f=fixture();f.request.mockResolvedValueOnce(new Response('rate limit',{status:429}));await expect(processVeniceImage(f.input,f.config,f.store,f.request,f.signal)).rejects.toThrow('429');expect(f.request).toHaveBeenCalledTimes(1);expect(f.store.update).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({status:'error'}))
  f.request.mockResolvedValueOnce(Response.json({error:'bad'}));await expect(processVeniceImage(f.input,f.config,f.store,f.request,f.signal)).rejects.toThrow('image type');expect(f.store.save).not.toHaveBeenCalled()
 })
})
