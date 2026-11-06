export type CropRect={x:number;y:number;width:number;height:number}
export function checkedCrop(rect:CropRect):CropRect{
 if(Object.values(rect).some(value=>!Number.isFinite(value))||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||rect.x+rect.width>100.001||rect.y+rect.height>100.001)throw Error('Invalid crop area')
 return rect
}
export function fitCrop(rect:CropRect,sourceRatio:number,ratio:number):CropRect{
 checkedCrop(rect);if(!Number.isFinite(ratio)||ratio<=0||!Number.isFinite(sourceRatio)||sourceRatio<=0)throw Error('Invalid crop ratio')
 const width=Math.min(rect.width,rect.height*ratio/sourceRatio),height=width*sourceRatio/ratio
 return checkedCrop({x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height})
}
export function draggedCrop(start:{x:number;y:number},end:{x:number;y:number},sourceRatio:number,ratio?:number):CropRect|null{
 const clamp=(value:number)=>Math.max(0,Math.min(100,value)),x=Math.min(clamp(start.x),clamp(end.x)),y=Math.min(clamp(start.y),clamp(end.y))
 const rect={x,y,width:Math.abs(clamp(end.x)-clamp(start.x)),height:Math.abs(clamp(end.y)-clamp(start.y))}
 if(rect.width<0.2||rect.height<0.2)return null
 return ratio?fitCrop(rect,sourceRatio,ratio):checkedCrop(rect)
}
export async function cropReferenceBitmap(bitmap:ImageBitmap,rect:CropRect,signal:AbortSignal):Promise<Blob>{
 checkedCrop(rect);signal.throwIfAborted()
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*rect.width/100));canvas.height=Math.max(1,Math.round(bitmap.height*rect.height/100))
 try{const context=canvas.getContext('2d');if(!context)throw Error('Image editing is unavailable on this device');context.drawImage(bitmap,bitmap.width*rect.x/100,bitmap.height*rect.y/100,bitmap.width*rect.width/100,bitmap.height*rect.height/100,0,0,canvas.width,canvas.height)
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Unable to crop this image')),'image/png'));signal.throwIfAborted();if(blob.size>10*1024*1024)throw Error('The cropped image exceeds 10 MB. Select a smaller area.');return blob
 }finally{canvas.width=canvas.height=1}
}
