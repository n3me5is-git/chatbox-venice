import {expect,it} from 'vitest'
import {fuseCollectionCandidates,selectedKnowledgeCollections} from './knowledge-federation'
it('bounds selected collections and preserves the legacy primary with portable additional IDs',()=>{expect(selectedKnowledgeCollections(1,[-1,-2,-1])).toEqual([1,-1,-2]);expect(selectedKnowledgeCollections(-1,[-1,-2])).toEqual([-1,-2]);expect(selectedKnowledgeCollections(undefined,[0,1,NaN,-2])).toEqual([-2]);expect(selectedKnowledgeCollections(1,Array.from({length:20},(_,n)=>-n-1))).toHaveLength(8)})
it('fuses bounded ranks and candidate lexical evidence without comparing raw vector scores',()=>{
 const lanes=[[{id:'a:1',text:'general unrelated notes',score:99999},{id:'a:2',text:'Aurora Acme',score:99998}],[{id:'b:1',text:'Aurora has client Acme',score:-1000}]],result=fuseCollectionCandidates('Aurora Acme',lanes)
 expect(result[0].id).not.toBe('a:1');expect(result.map(row=>row.id)).toContain('b:1');expect(result.find(row=>row.id==='b:1')!.score).toBe(-1000);expect(new Set(result.map(row=>row.id)).size).toBe(result.length)
})
