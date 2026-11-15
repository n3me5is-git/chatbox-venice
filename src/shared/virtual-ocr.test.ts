import {expect,it,vi} from 'vitest'
import {PADDLE_OCR_PROVIDER} from './paddle-ocr'
import {RagSettingsSchema} from './session-rag'
import {ragFingerprint} from './session-rag-engine'
import {OcrVisionFallbackSchema,runOcrWithFallback,validateOcrFallback} from './virtual-ocr'
const fallback={mode:'empty' as const,provider:'custom-local-vision',model:'any-vision-model'}
const options={provider:PADDLE_OCR_PROVIDER,fallback,text:(text:string)=>text}
it('makes no vision request with the default settings or a nonempty local result',async()=>{
 const vision=vi.fn(async()=>'vision'),primary=vi.fn(async()=>'local')
 expect(await runOcrWithFallback(primary,vision,{...options,fallback:undefined})).toBe('local')
 expect(await runOcrWithFallback(primary,vision,options)).toBe('local');expect(vision).not.toHaveBeenCalled()
})
it('uses any explicitly chosen vision provider after an empty result, once, and preserves its text',async()=>{
 const vision=vi.fn(async()=>'Aqua [illegible] 1916'),used=vi.fn()
 expect(await runOcrWithFallback(async()=>' \n',vision,{...options,onFallback:used})).toBe('Aqua [illegible] 1916')
 expect(vision).toHaveBeenCalledOnce();expect(used).toHaveBeenCalledOnce()
})
it('skips local inference in always mode, including confidently incorrect handwriting',async()=>{
 const primary=vi.fn(async()=>'wrong but confident'),vision=vi.fn(async()=>'transcription')
 expect(await runOcrWithFallback(primary,vision,{...options,fallback:{...fallback,mode:'always'}})).toBe('transcription');expect(primary).not.toHaveBeenCalled()
})
it('never converts an engine failure, lock cancellation or failed vision call into an implicit retry',async()=>{
 const vision=vi.fn(async()=>'vision');await expect(runOcrWithFallback(async()=>{throw Error('Device locked')},vision,options)).rejects.toThrow('Device locked');expect(vision).not.toHaveBeenCalled()
 const controller=new AbortController();controller.abort();await expect(runOcrWithFallback(async()=>' ',vision,{...options,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(vision).not.toHaveBeenCalled()
 const failed=vi.fn(async()=>{throw Error('quota')});await expect(runOcrWithFallback(async()=>' ',failed,options)).rejects.toThrow('quota');expect(failed).toHaveBeenCalledOnce()
})
it('cancels between local and remote inference and after remote completion',async()=>{
 const controller=new AbortController(),vision=vi.fn(async()=>'vision');await expect(runOcrWithFallback(async()=>{controller.abort();return ''},vision,{...options,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(vision).not.toHaveBeenCalled()
 const next=new AbortController();await expect(runOcrWithFallback(async()=>'',async()=>{next.abort();return 'result'},{...options,signal:next.signal})).rejects.toMatchObject({name:'AbortError'})
})
it('rejects incomplete/recursive targets and ignores stale fallback settings for a remote primary',async()=>{
 for(const value of [{...fallback,model:''},{...fallback,provider:PADDLE_OCR_PROVIDER}])expect(()=>validateOcrFallback(PADDLE_OCR_PROVIDER,value)).toThrow('Choose a vision model')
 const vision=vi.fn();expect(await runOcrWithFallback(async()=>'remote primary',vision,{...options,provider:'venice',fallback:{...fallback,mode:'always'}})).toBe('remote primary');expect(vision).not.toHaveBeenCalled()
 expect(OcrVisionFallbackSchema.safeParse({mode:'automatic-guessed'}).success).toBe(false)
})
it('keeps old index fingerprints unchanged and invalidates extraction only for active fallback changes',()=>{
 const cfg=RagSettingsSchema.parse({ocr:true,ocrProvider:PADDLE_OCR_PROVIDER,ocrModel:'paddle'})
 expect(ragFingerprint({...cfg,ocrVisionFallback:{...fallback,mode:'off'}})).toBe(ragFingerprint(cfg))
 expect(ragFingerprint({...cfg,ocrVisionFallback:fallback})).not.toBe(ragFingerprint(cfg))
 expect(ragFingerprint({...cfg,ocrVisionFallback:fallback})).not.toBe(ragFingerprint({...cfg,ocrVisionFallback:{...fallback,model:'other'}}))
 expect(ragFingerprint({...cfg,ocr:false,ocrVisionFallback:fallback})).toBe(ragFingerprint({...cfg,ocr:false}))
})
