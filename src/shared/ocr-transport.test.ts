import {expect,it} from 'vitest'
import {ocrTransportIssue,ENCRYPTED_OCR_UNAVAILABLE} from './ocr-transport'
it('distinguishes GLM Vision from the encrypted image transport',()=>{
 const info={modelId:'e2ee-glm-5-3-flash',capabilities:['vision'] as ['vision'],vendorMetadata:{capabilities:{supportsVision:true,supportsE2EE:true}}}
 expect(ocrTransportIssue('venice',info.modelId,{models:[info]},info)).toBe(ENCRYPTED_OCR_UNAVAILABLE)
 expect(ocrTransportIssue('venice',info.modelId,{venice:{textPrivacy:'standard'},models:[info]},info)).toBeUndefined()
 expect(ocrTransportIssue('venice','z-ai-glm-5-3-flash',{models:[{modelId:'z-ai-glm-5-3-flash',capabilities:['vision'],vendorMetadata:{privacy:'private'}}]})).toBeUndefined()
})
it('honors explicit encryption and does not affect other Vision providers',()=>{
 expect(ocrTransportIssue('venice','standard-vlm',{venice:{textPrivacy:'e2ee'}})).toBe(ENCRYPTED_OCR_UNAVAILABLE)
 expect(ocrTransportIssue('custom','e2ee-vlm')).toBeUndefined()
 expect(ocrTransportIssue('venice','e2ee-glm-5-3-flash')).toBe(ENCRYPTED_OCR_UNAVAILABLE)
})
