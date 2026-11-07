import { describe,expect,it } from 'vitest'
import { encryptedToolMessages,nativeToolMessages,parseEncryptedToolCalls } from './encrypted-tools'
const tools=[{type:'function',function:{name:'local_echo',description:'Read a local value',parameters:{type:'object',properties:{text:{type:'string'}},required:['text']}}}]
describe('venice-e2ee function-call text protocol',()=>{
 it.each(['<venice_tool_call>{"name":"local_echo","arguments":{"text":"private"}}</venice_tool_call>','<tool_call>{"name":"local_echo","arguments":{"text":"private"}}</tool_call>','<function_call>{"function":{"name":"local_echo","arguments":{"text":"private"}}}</function_call>','{"name":"local_echo","arguments":{"text":"private"}}'])('parses supported function envelopes after decryption: %s',reply=>{
  expect(parseEncryptedToolCalls(reply,tools,'auto')).toMatchObject([{function:{name:'local_echo',arguments:'{"text":"private"}'}}])
 })
 it('instructs models with private protocol tags distinct from backend-native reserved tags',()=>{
  const system=encryptedToolMessages([{role:'user',content:'question'}],tools,'auto')[0].content
  expect(system).toContain('<venice_tool_call>')
  expect(system).not.toContain('<tool_call>')
 })
 it('keeps ordinary JSON answers as answers and rejects unavailable calls',()=>{
  expect(parseEncryptedToolCalls('{"answer":42}',tools,'auto')).toBeUndefined()
  expect(()=>parseEncryptedToolCalls('<tool_call>{"name":"delete_all","arguments":{}}</tool_call>',tools,'auto')).toThrow('unavailable')
  expect(()=>parseEncryptedToolCalls('<tool_call>{"name":"local_echo","arguments":{"text":"x"}}</tool_call>',tools,'none')).toThrow('invalid')
 })
 it('recognizes the GLM XML envelope, including prose, entities and typed arguments',()=>{
  const definitions=[{type:'function',function:{name:'read_record',parameters:{type:'object',properties:{id:{type:'string'},count:{type:'integer'},enabled:{type:'boolean'},filters:{type:'object'},tags:{type:'array'}}}}}]
  const reply='I will read the local record.\n<function_calls><invoke name="read_record"><parameter name="id">A&amp;B</parameter><parameter name="count">2</parameter><parameter name="enabled">true</parameter><parameter name="filters">{&quot;year&quot;:2026}</parameter><parameter name="tags">[&quot;test&quot;]</parameter></invoke></function_calls>'
  const calls=parseEncryptedToolCalls(reply,definitions,'auto')!
  expect(calls).toHaveLength(1)
  expect(JSON.parse(calls[0].function.arguments)).toEqual({id:'A&B',count:2,enabled:true,filters:{year:2026},tags:['test']})
 })
 it('recognizes parallel XML calls and empty argument objects',()=>{
  const reply='<function_calls><invoke name="local_echo"><parameter name="text" type="string">first</parameter></invoke><invoke name="local_echo"></invoke></function_calls>'
  expect(parseEncryptedToolCalls(reply,tools,'auto')?.map(call=>JSON.parse(call.function.arguments))).toEqual([{text:'first'},{}])
 })
 it.each([
  '<invoke name="local_echo" name="other"></invoke>',
  '<invoke name="local_echo"><parameter name="text">one</parameter><parameter name="text">two</parameter></invoke>',
  '<invoke name="local_echo"><parameter name="text">&external;</parameter></invoke>',
  '<!DOCTYPE x><invoke name="local_echo"></invoke>',
  '<invoke name="local_echo"><parameter name="text"><nested/></parameter></invoke>',
  '<invoke name="local_echo"><parameter name="text">unfinished</invoke>',
  '<invoke name="local_echo"><parameter name="text" type="code">value</parameter></invoke>',
 ])('rejects malformed or ambiguous XML without executing: %s',block=>{
  expect(parseEncryptedToolCalls('<function_calls>'+block+'</function_calls>',tools,'auto')).toBeUndefined()
 })
 it('does not execute quoted XML examples, unknown names, or disallowed tool choices',()=>{
  const xml='<function_calls><invoke name="local_echo"><parameter name="text">private</parameter></invoke></function_calls>'
  expect(parseEncryptedToolCalls(JSON.stringify({example:xml}),tools,'auto')).toBeUndefined()
  expect(()=>parseEncryptedToolCalls(xml,tools,'none')).toThrow('invalid')
  expect(()=>parseEncryptedToolCalls(xml.replace('local_echo','unknown'),tools,'auto')).toThrow('unavailable')
  expect(()=>parseEncryptedToolCalls(xml,tools,{type:'function',function:{name:'different'}})).toThrow('unavailable')
 })
 it('renders call IDs and results into text without native metadata',()=>{
  const output=encryptedToolMessages([{role:'user',content:'question'},{role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'local_echo',arguments:'{"text":"secret"}'}}]},{role:'tool',tool_call_id:'call-1',content:'private result'}],tools,'auto')
  expect(JSON.stringify(output)).toContain('private result');expect(JSON.stringify(output)).toContain('call-1')
  expect(output.every(message=>!('tool_calls'in message)&&!('tool_call_id'in message))).toBe(true)
 })
 it('keeps only a pending native call/result public, and folds older rounds back into private text',()=>{
  const result=nativeToolMessages([{role:'user',content:'private question'},{role:'assistant',content:'private assistant commentary',tool_calls:[{id:'call-1',function:{name:'local_echo',arguments:'{}'}}]},{role:'tool',tool_call_id:'call-1',content:'result'}])
  expect(result.publicMessages.map(message=>message.role)).toEqual(['assistant','tool'])
  expect(JSON.stringify(result.publicMessages)).not.toContain('private question')
  expect(JSON.stringify(result.publicMessages)).not.toContain('private assistant commentary')
  expect(JSON.stringify(result.privateMessages)).toContain('private assistant commentary')
  const finished=nativeToolMessages([...result.publicMessages,{role:'assistant',content:'private answer'},{role:'user',content:'new question'}])
  expect(finished.publicMessages).toEqual([]);expect(JSON.stringify(finished.privateMessages)).toContain('private answer')
 })
})
