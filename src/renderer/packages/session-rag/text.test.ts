import {expect,it} from 'vitest'
import {decodeRagText} from './text'
it('decodes multibyte text across chunk boundaries without changing ordinary session limits',()=>{const text='x'.repeat(65535)+'😀à\nend',bytes=new TextEncoder().encode(text);expect(decodeRagText(bytes)).toBe(text);expect(()=>decodeRagText(bytes,65536)).toThrow('indexing limit')})
it('fails explicitly on oversized KB text and still skips binary/invalid UTF-8 sources',()=>{expect(()=>decodeRagText(new Uint8Array(1024*1024).fill(65),512000)).toThrow('indexing limit');expect(decodeRagText(new Uint8Array([1,0,2]))).toBeUndefined();expect(decodeRagText(new Uint8Array([0xff]))).toBeUndefined()})
