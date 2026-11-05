import { describe,expect,it } from 'vitest'
import { imageDimensions } from './image-thumbnail'
describe('bounded image header sizing',()=>{
 it('reads PNG and WebP dimensions and rejects unrealistic or truncated headers',()=>{const png=new Uint8Array(24);png.set([137,80,78,71]);const view=new DataView(png.buffer);view.setUint32(16,2048);view.setUint32(20,1024);expect(imageDimensions(png)).toEqual({width:2048,height:1024});view.setUint32(16,100000);expect(imageDimensions(png)).toBeNull();const webp=new Uint8Array(30);webp.set(new TextEncoder().encode('RIFF'),0);webp.set(new TextEncoder().encode('WEBPVP8X'),8);webp[24]=255;webp[25]=3;webp[27]=255;webp[28]=1;expect(imageDimensions(webp)).toEqual({width:1024,height:512});expect(imageDimensions(png.slice(0,15))).toBeNull()})
 it('finds JPEG frame dimensions without decoding image pixels',()=>{const jpeg=new Uint8Array([255,216,255,224,0,4,0,0,255,192,0,8,8,4,0,8,0,0]);expect(imageDimensions(jpeg)).toEqual({width:2048,height:1024})})
})
