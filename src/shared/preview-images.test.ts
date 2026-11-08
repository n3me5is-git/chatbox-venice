import { expect,it,vi } from 'vitest'
import { PreviewImages } from './preview-images'
import type { SessionResource } from './session-resources'
const image:SessionResource={id:'one',path:'one.png',name:'one.png',origin:'file',mime:'image/png'}
it('serializes concurrent requests and never publishes more than the total byte budget',async()=>{
  let active=0,peak=0
  const read=vi.fn(async()=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return new Uint8Array([1,2,3,4])})
  const loader=new PreviewImages(read,8,4),results=await Promise.all(Array.from({length:100},()=>loader.load(image)))
  expect(peak).toBe(1);expect(read).toHaveBeenCalledTimes(2);expect(results.filter(Boolean)).toHaveLength(2)
  expect([...new Uint8Array(await results[0]!.arrayBuffer())]).toEqual([1,2,3,4])
})
it('drops and clears an in-flight private image and skips queued reads when the preview closes',async()=>{
  const bytes=new Uint8Array([1,2]);let finish!:(bytes:Uint8Array)=>void
  const read=vi.fn(()=>new Promise<Uint8Array>(resolve=>{finish=resolve})),loader=new PreviewImages(read)
  const first=loader.load(image),queued=loader.load(image)
  await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(1));loader.close();finish(bytes)
  expect(await first).toBeUndefined();expect(await queued).toBeUndefined();expect([...bytes]).toEqual([0,0]);expect(read).toHaveBeenCalledTimes(1)
})
it('bounds unknown-size oversized images and failed reads without blocking subsequent small images',async()=>{
  const oversized=new Uint8Array(5).fill(1),read=vi.fn().mockRejectedValueOnce(Error('Missing')).mockResolvedValueOnce(oversized).mockResolvedValueOnce(new Uint8Array([7]))
  const loader=new PreviewImages(read,8,4)
  await expect(loader.load(image)).rejects.toThrow('Missing');expect(await loader.load(image)).toBeUndefined();expect([...oversized]).toEqual([0,0,0,0,0]);expect((await loader.load(image))?.size).toBe(1)
  expect(await loader.load({...image,bytes:100})).toBeUndefined();expect(read).toHaveBeenCalledTimes(3)
})
