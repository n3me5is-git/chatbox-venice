import { expect,it,vi } from 'vitest'
vi.mock('@/app/renderer-application',()=>({rendererApplication:{}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:vi.fn()}))
vi.mock('@/platform',()=>({default:{}}))
import { mentionedChatTool } from './chat-tool'
import { createMessage } from '@shared/types'
const context={toolCallId:'read',messages:[],abortSignal:new AbortController().signal,context:undefined}
it('reads only a conversation explicitly tagged in the current request, rechecks access and strips system/tool content',async()=>{
  const assertAccess=vi.fn(async()=>{}),read=vi.fn(async()=>({name:'Reference',messages:[createMessage('system','Secret system prompt'),createMessage('user','A useful excerpt'),{...createMessage('assistant','Answer'),contentParts:[{type:'text' as const,text:'Answer'},{type:'tool-call' as const,toolCallId:'secret',toolName:'mcp_secret',state:'result' as const,result:{private:'hidden'}}]}]}))
  const tools=mentionedChatTool('Use [@Reference](chatbox:chat/one)',{assertAccess,read})
  const result=await tools.read_mentioned_chat!.execute!({id:'one'},context)
  expect(result).toEqual({name:'Reference',messages:[{role:'user',text:'A useful excerpt'},{role:'assistant',text:'Answer'}],truncated:false});expect(assertAccess).toHaveBeenCalledTimes(2)
  await expect(tools.read_mentioned_chat!.execute!({id:'two'},context)).rejects.toThrow('not tagged');expect(read).toHaveBeenCalledOnce()
})
it('blocks access before reading and bounds the excerpt',async()=>{
  const read=vi.fn(async()=>({name:'Large',messages:[createMessage('user','x'.repeat(30000))]})),assertAccess=vi.fn(async()=>{throw Error('Locked')})
  await expect(mentionedChatTool('[@Other](chatbox:chat/other)',{assertAccess,read}).read_mentioned_chat!.execute!({id:'other'},context)).rejects.toThrow('Locked');expect(read).not.toHaveBeenCalled()
  const result=await mentionedChatTool('[@Other](chatbox:chat/other)',{assertAccess:async()=>{},read}).read_mentioned_chat!.execute!({id:'other'},context) as any
  expect(result.messages[0].text).toHaveLength(20000);expect(result.truncated).toBe(true)
})
