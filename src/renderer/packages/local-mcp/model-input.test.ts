import {expect,it} from 'vitest'
import {externalMessagesSchema,externalModelInput,externalToolsSchema} from './model-input'
it('returns external function calls to the orchestrator without installing a local executor',()=>{
  const definitions=externalToolsSchema.parse([{name:'erp_lookup',description:'Read pseudonymous orders',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}}])
  const result=externalModelInput(externalMessagesSchema.parse([{role:'user',content:'Find order A'}]),definitions)
  expect(result.tools.erp_lookup.execute).toBeUndefined();expect(result.messages).toEqual([{role:'user',content:'Find order A'}])
})
it('preserves function identifiers, arguments and results for the next encrypted or native model turn',()=>{
  const messages=externalMessagesSchema.parse([{role:'assistant',toolCalls:[{toolCallId:'call-one',toolName:'erp_lookup',input:{id:'A'}}]},{role:'tool',toolCallId:'call-one',toolName:'erp_lookup',result:{amount:5}}])
  const result=externalModelInput(messages,[])
  expect(result.messages[0]).toMatchObject({role:'assistant',content:[{type:'tool-call',toolCallId:'call-one',toolName:'erp_lookup',input:{id:'A'}}]})
  expect(result.messages[1]).toMatchObject({role:'tool',content:[{type:'tool-result',toolCallId:'call-one',output:{type:'json',value:{amount:5}}}]})
})
it('rejects duplicate tools, unsupported message fields and excessive external schemas',()=>{
  expect(()=>externalMessagesSchema.parse([{role:'user',content:'a',apiKey:'not accepted'}])).toThrow()
  const definition={name:'same',inputSchema:{type:'object' as const}}
  expect(()=>externalModelInput([{role:'user',content:'a'}],[definition,definition])).toThrow('unique')
  expect(()=>externalToolsSchema.parse(Array.from({length:33},(_,i)=>({...definition,name:'f'+i})))).toThrow()
})
