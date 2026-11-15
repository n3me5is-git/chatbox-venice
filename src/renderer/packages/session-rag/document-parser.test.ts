import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {parseRagDocument} from './document-parser'
const workers:any[]=[]
class WorkerFixture {onmessage:any;onerror:any;postMessage=vi.fn();terminate=vi.fn();constructor(){workers.push(this)}}
beforeEach(()=>{workers.length=0;vi.stubGlobal('Worker',WorkerFixture)})
afterEach(()=>vi.unstubAllGlobals())
it('transfers a binary copy to a disposable read-only worker instead of a base64 workspace',async()=>{const bytes=new Uint8Array(11*1024*1024),pending=parseRagDocument('large.docx',bytes,new AbortController().signal),worker=workers[0],request=worker.postMessage.mock.calls[0];expect(request[0].bytes.byteLength).toBe(bytes.length);expect(request[0].bytes.buffer).not.toBe(bytes.buffer);expect(request[1]).toEqual([request[0].bytes.buffer]);expect(request[0]).not.toHaveProperty('files');worker.onmessage({data:{parsed:{text:'Parsed',truncated:false}}});expect(await pending).toEqual({text:'Parsed',truncated:false});expect(worker.terminate).toHaveBeenCalledOnce();expect(bytes.byteLength).toBe(11*1024*1024)})
it('cancels and terminates the worker, and refuses over-limit inputs before starting one',async()=>{const controller=new AbortController(),pending=parseRagDocument('file.docx',new Uint8Array([1]),controller.signal);controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(workers[0].terminate).toHaveBeenCalledOnce();await expect(parseRagDocument('file.docx',new Uint8Array(50*1024*1024+1),new AbortController().signal)).rejects.toThrow('50 MB');expect(workers).toHaveLength(1)})
