import { expect, it } from 'vitest'
import { agentCallerDescription, DedicatedAgentSchema } from './multi-agent'
const input={id:'writer',name:'writer',title:'Writer',description:'Line one\nLine two',prompt:'WORKER_SECRET',model:{provider:'venice',modelId:'model'},guardian:{enabled:true,prompt:'GUARDIAN_SECRET',model:{provider:'private',modelId:'guard'}}}
it('keeps existing agents private by default and preserves multiline calling details',()=>{
 const agent=DedicatedAgentSchema.parse({...input,additionalDetails:'Input: a topic\nOutput: Markdown'})
 const restored=DedicatedAgentSchema.parse(JSON.parse(JSON.stringify(agent)))
 expect(agentCallerDescription(restored)).toContain('Line one\nLine two')
 expect(agentCallerDescription(restored)).toContain('Input: a topic\nOutput: Markdown')
 expect(agentCallerDescription(restored)).not.toContain('SECRET')
 expect(DedicatedAgentSchema.parse(input).sharePromptWithCaller).not.toBe(true)
})
it('appends only the worker prompt when explicitly shared and removes it when sharing is off',()=>{
 const agent=DedicatedAgentSchema.parse({...input,sharePromptWithCaller:true})
 expect(agentCallerDescription(agent)).toContain('WORKER_SECRET')
 expect(agentCallerDescription(agent)).not.toContain('GUARDIAN_SECRET')
 expect(agentCallerDescription({...agent,sharePromptWithCaller:false})).not.toContain('WORKER_SECRET')
})
