import {imageDimensions} from '@shared/utils/image-dimensions'
/** The compact Windows codec lacks WebP; conversion stays inside the renderer. */
export async function preparePaddleImage(image:string,signal?:AbortSignal):Promise<string>{
 if(!image.startsWith('data:image/webp;base64,')||typeof window==='undefined'||!window.electronAPI)return image
 signal?.throwIfAborted();if(image.length>24*1024*1024)throw Error('Use a supported local OCR image')
 const bytes=Uint8Array.from(atob(image.slice(image.indexOf(',')+1)),c=>c.charCodeAt(0)),dimensions=imageDimensions(bytes.subarray(0,65536))
 if(!dimensions||dimensions.width*dimensions.height>16777216){bytes.fill(0);throw Error('Use an image up to 16 megapixels')}
 const scale=Math.min(1,2400/Math.max(dimensions.width,dimensions.height)),width=Math.max(1,Math.round(dimensions.width*scale)),height=Math.max(1,Math.round(dimensions.height*scale))
 let bitmap:ImageBitmap|undefined;const canvas=document.createElement('canvas')
 try{bitmap=await createImageBitmap(new Blob([Uint8Array.from(bytes)],{type:'image/webp'}),{resizeWidth:width,resizeHeight:height,resizeQuality:'high'});signal?.throwIfAborted();canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw Error('Use a supported local OCR image');context.drawImage(bitmap,0,0,width,height);const output=canvas.toDataURL('image/png');if(output.length>24*1024*1024)throw Error('Use a supported local OCR image');return output}finally{bytes.fill(0);bitmap?.close();canvas.width=canvas.height=0}
}
