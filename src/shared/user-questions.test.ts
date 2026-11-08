import { expect,it,vi } from 'vitest'
import { createAskUserTool } from './user-questions'
const context={toolCallId:'question',messages:[],abortSignal:new AbortController().signal}
it('waits for selected choices and custom text without inventing an answer',async()=>{
  const ask=vi.fn(async()=>({answers:[{selected:['A','B'],text:'Additional context'}]})),tool=createAskUserTool(ask)
  expect(await tool.execute!({questions:[{question:'Choose',options:['A','B','C'],multiple:true}]},context)).toEqual({cancelled:false,answers:[{question:'Choose',selected:['A','B'],text:'Additional context'}]})
})
it('returns an explicit cancellation and rejects invalid multiple selections or excessive questions',async()=>{
  const tool=createAskUserTool(async()=>null)
  expect(await tool.execute!({questions:[{question:'What do you need?'}]},context)).toMatchObject({cancelled:true})
  await expect(tool.execute!({questions:[]},context)).rejects.toThrow()
  const invalid=createAskUserTool(async()=>({answers:[{selected:['A','B'],text:''}]}))
  await expect(invalid.execute!({questions:[{question:'Choose one',options:['A','B']}]},context)).rejects.toThrow('Invalid user answer')
})
