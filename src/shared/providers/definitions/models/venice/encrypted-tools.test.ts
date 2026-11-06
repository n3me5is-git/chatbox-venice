import { describe,expect,it } from 'vitest'
import { encryptedToolMessages,nativeToolMessages,parseEncryptedToolCalls } from './encrypted-tools'
const tools=[{type:'function',function:{name:'local_echo',description:'Read a local value',parameters:{type:'object',properties:{text:{type:'string'}},required:['text']}}}]
describe('venice-e2ee function-call text protocol',()=>{
 it.each(['<tool_call>{"name":"local_echo","arguments":{"text":"private"}}</tool_call>','<function_call>{"function":{"name":"local_echo","arguments":{"text":"private"}}}</function_call>','{"name":"local_echo","arguments":{"text":"private"}}'])('parses supported function envelopes after decryption: %s',reply=>{
  expect(parseEncryptedToolCalls(reply,tools,'auto')).toMatchObject([{function:{name:'local_echo',arguments:'{"text":"private"}'}}])
 })
 it('keeps ordinary JSON answers as answers and rejects unavailable calls',()=>{
  expect(parseEncryptedToolCalls('{"answer":42}',tools,'auto')).toBeUndefined()
  expect(()=>parseEncryptedToolCalls('<tool_call>{"name":"delete_all","arguments":{}}</tool_call>',tools,'auto')).toThrow('unavailable')
  expect(()=>parseEncryptedToolCalls('<tool_call>{"name":"local_echo","arguments":{"text":"x"}}</tool_call>',tools,'none')).toThrow('invalid')
 })
 it('renders call IDs and results into text without native metadata',()=>{
  const output=encryptedToolMessages([{role:'user',content:'question'},{role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'local_echo',arguments:'{"text":"secret"}'}}]},{role:'tool',tool_call_id:'call-1',content:'private result'}],tools,'auto')
  expect(JSON.stringify(output)).toContain('private result');expect(JSON.stringify(output)).toContain('call-1')
  expect(output.every(message=>!('tool_calls'in message)&&!('tool_call_id'in message))).toBe(true)
 })
 it('keeps only a pending native call/result public, and folds older rounds back into private text',()=>{
  const result=nativeToolMessages([{role:'user',content:'private question'},{role:'assistant',content:null,tool_calls:[{id:'call-1',function:{name:'local_echo',arguments:'{}'}}]},{role:'tool',tool_call_id:'call-1',content:'result'}])
  expect(result.publicMessages.map(message=>message.role)).toEqual(['assistant','tool'])
  expect(JSON.stringify(result.publicMessages)).not.toContain('private question')
  const finished=nativeToolMessages([...result.publicMessages,{role:'assistant',content:'private answer'},{role:'user',content:'new question'}])
  expect(finished.publicMessages).toEqual([]);expect(JSON.stringify(finished.privateMessages)).toContain('private answer')
 })
})
