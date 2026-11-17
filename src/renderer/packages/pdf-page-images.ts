import type {PDFPageProxy} from 'pdfjs-dist'
/** Best-effort extraction of embedded raster objects, after page rendering.
 * Vector figures, masks and unsupported image encodings remain in the page preview. */
export async function pdfPageImages(page:PDFPageProxy,ops:Record<string,number>,signal:AbortSignal){
 const list=await page.getOperatorList(),result:string[]=[],seen=new Set<string>()
 for(let i=0;i<list.fnArray.length&&result.length<8;i++){
  signal.throwIfAborted();if(![ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageXObjectRepeat].includes(list.fnArray[i]))continue
  const key=list.argsArray[i]?.[0];if(typeof key==='string'&&seen.has(key))continue;if(typeof key==='string')seen.add(key)
  let canvas:HTMLCanvasElement|undefined,rgba:Uint8ClampedArray|undefined
  try{const image=(typeof key==='string'?(key.startsWith('g_')?page.commonObjs:page.objs).get(key):key) as {width:number;height:number;bitmap?:ImageBitmap;data?:Uint8Array|Uint8ClampedArray};if(!image||image.width<2||image.height<2||image.width*image.height>16_000_000)continue
   const scale=Math.min(1,1600/Math.max(image.width,image.height));canvas=document.createElement('canvas');canvas.width=Math.ceil(image.width*scale);canvas.height=Math.ceil(image.height*scale);const context=canvas.getContext('2d');if(!context)continue
   if(image.bitmap)context.drawImage(image.bitmap,0,0,canvas.width,canvas.height)
   else if(image.data&&scale===1){const pixels=image.width*image.height;rgba=new Uint8ClampedArray(pixels*4);if(image.data.length===pixels*4)rgba.set(image.data);else if(image.data.length===pixels*3)for(let n=0;n<pixels;n++){rgba[n*4]=image.data[n*3];rgba[n*4+1]=image.data[n*3+1];rgba[n*4+2]=image.data[n*3+2];rgba[n*4+3]=255}else if(image.data.length===pixels)for(let n=0;n<pixels;n++){rgba.fill(image.data[n],n*4,n*4+3);rgba[n*4+3]=255}else continue;context.putImageData(new ImageData(rgba,image.width,image.height),0,0)}else continue
   result.push(canvas.toDataURL('image/png'))
  }catch{signal.throwIfAborted()}finally{rgba?.fill(0);if(canvas){canvas.width=0;canvas.height=0}}
 }
 return result
}
