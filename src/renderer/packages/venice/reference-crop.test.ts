import { expect,it } from 'vitest'
import { checkedCrop,draggedCrop,fitCrop } from './reference-crop'
import { inheritLocalFile,localFileOrigin,markLocalFile } from '../local-file-origin'
it('keeps free and fixed-aspect crops inside the original image, including reverse drags',()=>{
 expect(draggedCrop({x:100,y:100},{x:50,y:0},2)).toEqual({x:50,y:0,width:50,height:100})
 const square=fitCrop({x:0,y:0,width:100,height:100},2,1);expect(square).toEqual({x:25,y:0,width:50,height:100})
 expect(draggedCrop({x:-20,y:-50},{x:120,y:150},1,1)).toEqual({x:0,y:0,width:100,height:100})
 expect(draggedCrop({x:50,y:50},{x:50,y:50},1)).toBeNull()
 expect(()=>checkedCrop({x:99,y:0,width:2,height:100})).toThrow('Invalid')
})
it('carries a protected library origin to the cropped copy without changing the original',()=>{
 const source=markLocalFile(new File(['source'],'original.png'),{scope:'project:private',key:'original-key'}),copy=inheritLocalFile(source,new File(['crop'],'crop.png'))
 expect(localFileOrigin(copy)).toEqual({scope:'project:private',key:'original-key'});expect(source.name).toBe('original.png');expect(copy).not.toBe(source)
})
