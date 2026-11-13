import {expect,it} from 'vitest'
import {layoutKnowledgeGraph} from './knowledge-graph'
it('bounds layout work and produces deterministic finite positions without animation',()=>{
 const input=Array.from({length:2000},(_,n)=>({id:String(n).padStart(4,'0'),name:'Entity '+n,type:n%2?'client':'project'})),edges=Array.from({length:2000},(_,n)=>({subject:input[n].id,object:input[(n+1)%2000].id})),first=layoutKnowledgeGraph(input,edges)
 expect(first).toHaveLength(150);expect(first).toEqual(layoutKnowledgeGraph([...input].reverse(),edges));for(const node of first){expect(node.x).toBeGreaterThanOrEqual(35);expect(node.x).toBeLessThanOrEqual(765);expect(node.y).toBeGreaterThanOrEqual(30);expect(node.y).toBeLessThanOrEqual(490)}
})
