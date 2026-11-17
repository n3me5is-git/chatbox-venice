import {expect,it} from 'vitest'
import {KnowledgeExtractionSchema,compactKnowledgeSummary} from './knowledge-augmentation'
it('bounds verbose summary previews without rewriting source evidence',()=>{
 const quote='Project Aurora has client Acme.',summary='Source-grounded document summary. '.repeat(45),value=KnowledgeExtractionSchema.parse({summary,entities:[{name:'Aurora',type:'project',quote}],relations:[],tags:[]})
 expect(value.summary.length).toBeLessThanOrEqual(600);expect(value.summary.endsWith('…')).toBe(true);expect(summary.startsWith(value.summary.slice(0,-1))).toBe(true);expect(value.entities[0].quote).toBe(quote)
 expect(KnowledgeExtractionSchema.parse(value)).toEqual(value)
})
it('keeps short summaries intact and never splits a Unicode surrogate pair',()=>{
 expect(compactKnowledgeSummary('Short source summary.')).toBe('Short source summary.')
 const value=compactKnowledgeSummary('a'.repeat(598)+'😀'+'b'.repeat(40));expect(value).toBe('a'.repeat(598)+'…')
})
it('retains strict bounds for evidence and unbounded model output',()=>{
 const base={summary:'Summary',entities:[],relations:[],tags:[]};expect(()=>KnowledgeExtractionSchema.parse({...base,summary:'x'.repeat(12001)})).toThrow();expect(()=>KnowledgeExtractionSchema.parse({...base,entities:[{name:'Aurora',type:'project',quote:'x'.repeat(801)}]})).toThrow()
})
