import { describe,expect,it } from 'vitest'
import { localText } from './local-text'
describe('on-demand transcript decoding',()=>{it('reads UTF-8 local text only and rejects remote or malformed content',()=>{expect(localText('data:text/plain;base64,Q2nDsg==')).toBe('Ciò');expect(localText('https://external.example/transcript')).toBeNull();expect(()=>localText('data:text/plain;base64,not a base64 payload')).toThrow('preview size limit')})})
