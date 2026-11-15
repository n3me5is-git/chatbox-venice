// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {LOCAL_OCR_MODELS} from '@shared/local-ocr'
import {localOcrControl,recognizeLocally} from './client'
afterEach(()=>{delete (window as any).electronAPI})
it('rejects mobile/web instead of falling back to a provider',async()=>{await expect(localOcrControl('status')).rejects.toThrow('desktop only')})
it('cancels its own native request and never accepts a late result after cancellation',async()=>{let finish:(v:string)=>void=()=>{};const invoke=vi.fn((_channel:string,command:string)=>command==='ocr'?new Promise<string>(resolve=>finish=resolve):Promise.resolve());(window as any).electronAPI={invoke};const controller=new AbortController(),run=recognizeLocally(LOCAL_OCR_MODELS.q4,'data:image/png;base64,AQID',controller.signal);controller.abort();finish('late');await expect(run).rejects.toThrow();expect(invoke).toHaveBeenCalledWith('local-ocr:control','cancel',expect.any(String))})
