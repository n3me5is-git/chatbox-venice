import {expect,it} from 'vitest'
import {recursiveRagChunks} from './rag-chunker'
it('keeps bounded recursive chunks, overlap and exact original line references',()=>{
 const text='# Chapter\n'+Array.from({length:80},(_,n)=>'Line '+n+': '+'sample content '.repeat(9)).join('\n'),chunks=recursiveRagChunks(text)
 expect(chunks.length).toBeGreaterThan(4)
 for(const chunk of chunks){expect(chunk.text.length).toBeLessThanOrEqual(1200);expect(text).toContain(chunk.text);expect(text.split('\n').slice(chunk.line-1,chunk.endLine).join('\n')).toContain(chunk.text)}
 expect(chunks[0].text.slice(-180)).toContain(chunks[1].text.slice(0,50))
})
it('keeps page boundaries and handles huge lines without losing text or looping',()=>{
 const chunks=recursiveRagChunks('==== Page 1 ====\n'+ 'x'.repeat(2300)+'\n==== Page 2 ====\nSecond page')
 expect(chunks.at(-1)?.page).toBe(2);expect(chunks.at(-1)?.text).toContain('Second page');expect(chunks.length).toBeLessThan(10);expect(chunks.filter(chunk=>chunk.page===1).every(chunk=>!chunk.text.includes('Second page'))).toBe(true)
 expect(()=>recursiveRagChunks('x'.repeat(500001))).toThrow('limit')
})
