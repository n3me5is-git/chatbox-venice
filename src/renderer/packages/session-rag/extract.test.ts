// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest'
import {RagSettingsSchema} from '@shared/session-rag'
const state=vi.hoisted(()=>({text:'',chat:vi.fn(),render:vi.fn(),stt:vi.fn()}))
vi.mock('@/adapters',()=>({createModel:async()=>({isSupportVision:()=>true,chat:state.chat})}))
vi.mock('@/packages/pdf-parser',()=>({parsePdfFileLocally:async()=>state.text,pdfPagesForOcr:async function*(_file:any,_signal:any,pages?:Set<number>){state.render(pages);for(const page of [1,2])if(!pages||pages.has(page))yield {page,dataUrl:'data:image/png;base64,AQID'}}}))
vi.mock('@/packages/mobile-work-mode/execution-service',()=>({capacitorExecution:{parseDocument:vi.fn()}}))
vi.mock('@/packages/knowledge-collections/stt',()=>({transcribeKnowledgeAudio:state.stt}))
import {extractRagSource} from './extract'
const source={path:'document.pdf',mime:'application/pdf'},signal=new AbortController().signal
const cfg=()=>RagSettingsSchema.parse({ocr:true,ocrProvider:'vision',ocrModel:'vision-model'})
beforeEach(()=>{vi.clearAllMocks();state.text='';state.chat.mockResolvedValue({contentParts:[{type:'text',text:'Scanned page text'}]})})
it('extracts mixed PDFs locally and OCRs only pages with no extracted text when explicitly enabled',async()=>{
 state.text='==== Page 1 ====\n\nExisting text\n\n==== Page 2 ====\n\n'
 const off=await extractRagSource(source,new Uint8Array(),{...cfg(),ocr:false},signal);expect(off.text).toContain('Existing text');expect(state.chat).not.toHaveBeenCalled()
 const on=await extractRagSource(source,new Uint8Array(),cfg(),signal);expect(on.text).toContain('Existing text');expect(on.text).toContain('==== Page 2 ====\nScanned page text');expect(state.chat).toHaveBeenCalledOnce();expect([...state.render.mock.calls[0][0]]).toEqual([2])
})
it('does not silently upload a scanned PDF, photo or audio without its separate opt-in',async()=>{
 await expect(extractRagSource(source,new Uint8Array(),RagSettingsSchema.parse({}),signal)).rejects.toThrow('enable OCR')
 for(const mime of ['image/png','audio/wav'])expect(await extractRagSource({path:'file',mime},new Uint8Array(),RagSettingsSchema.parse({}),signal)).toEqual({})
 expect(state.chat).not.toHaveBeenCalled();expect(state.render).not.toHaveBeenCalled()
})
it('uses selected photo embeddings in preference to OCR and stops on remote OCR errors',async()=>{
 expect(await extractRagSource({path:'image.png',mime:'image/png'},new Uint8Array(),{...cfg(),images:true},signal)).toEqual({media:true});expect(state.chat).not.toHaveBeenCalled()
 state.chat.mockRejectedValue(Error('OCR provider unavailable'));await expect(extractRagSource(source,new Uint8Array(),cfg(),signal)).rejects.toMatchObject({fatal:true,message:'OCR provider unavailable'})
})

it('uses explicit STT for audio text while native audio embeddings retain precedence',async()=>{
 state.stt.mockResolvedValue('Transcript for indexing');const source={path:'voice.wav',mime:'audio/wav'},settings={...cfg(),stt:true,sttProvider:'venice',sttModel:'asr',audio:false}
 expect(await extractRagSource(source,new Uint8Array([1]),settings,signal)).toMatchObject({kind:'transcript',text:'Transcript for indexing'});expect(state.stt).toHaveBeenCalledOnce();state.stt.mockClear()
 expect(await extractRagSource(source,new Uint8Array([1]),{...settings,audio:true},signal)).toEqual({media:true});expect(state.stt).not.toHaveBeenCalled()
})
