import { imageDimensions } from '@shared/utils/image-dimensions'
export { imageDimensions } from '@shared/utils/image-dimensions'
export async function createImageThumbnail(data:string,signal:AbortSignal):Promise<string|null>{
 signal.throwIfAborted();if(typeof createImageBitmap!=='function'||typeof document==='undefined')return null
 const source=data.startsWith('data:image/')?data:/^[A-Za-z0-9+/=\r\n]+$/.test(data)?'data:image/png;base64,'+data:null;if(!source)return null
 const blob=await(await fetch(source,{signal})).blob();const dimensions=imageDimensions(new Uint8Array(await blob.slice(0,65536).arrayBuffer()));if(!dimensions)return null
 const scale=Math.min(1,256/dimensions.width,256/dimensions.height),width=Math.max(1,Math.round(dimensions.width*scale)),height=Math.max(1,Math.round(dimensions.height*scale));signal.throwIfAborted()
 const bitmap=await createImageBitmap(blob,{resizeWidth:width,resizeHeight:height,resizeQuality:'high'})
 try{signal.throwIfAborted();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)return null;context.drawImage(bitmap,0,0,width,height);return canvas.toDataURL('image/webp',0.72)}finally{bitmap.close()}
}
