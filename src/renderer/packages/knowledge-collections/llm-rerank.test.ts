import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({chat:vi.fn(),create:vi.fn(),provider:{apiKey:'test-only',apiHost:'https://example.invalid'}}))
vi.mock('@/adapters',()=>({createModel:(...args:unknown[])=>{state.create(...args);return {chat:state.chat}}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>({providers:{test:state.provider}})})}}))
import {rerankWithLLM} from './llm-rerank'
const signal=()=>new AbortController().signal
beforeEach(()=>{vi.clearAllMocks();state.provider={apiKey:'test-only',apiHost:'https://example.invalid'};state.chat.mockResolvedValue({contentParts:[{type:'text',text:JSON.stringify({ranking:[{index:1,score:0.9},{index:0,score:0.2}]})}]})})
it('reranks stable source identities with one isolated model call and no tool execution',async()=>{
 expect(await rerankWithLLM('project',['unrelated','source evidence'],'test','small',signal())).toEqual([{index:1,score:0.9},{index:0,score:0.2}])
 expect(state.create).toHaveBeenCalledWith(expect.objectContaining({provider:'test',modelId:'small',subscriptionWebSearch:false,veniceProfile:expect.objectContaining({webSearch:'off'})}))
 expect(state.chat).toHaveBeenCalledOnce();expect(state.chat.mock.calls[0][1]).toMatchObject({maxSteps:1,tools:{}})
 expect(JSON.parse(state.chat.mock.calls[0][0][1].content)).toEqual({query:'project',passages:[{index:0,text:'unrelated'},{index:1,text:'source evidence'}]})
})
it.each([{ranking:[{index:4,score:0.8}]},{ranking:[{index:0,score:0.5},{index:0,score:0.8}]},{ranking:[{index:1,score:1.4}]},{ranking:[]},{ranking:[{index:0,score:0.5}],execute:'exfiltrate'}])('rejects malformed/foreign/duplicated ranking output without another paid call: %j',async value=>{
 state.chat.mockResolvedValue({contentParts:[{type:'text',text:JSON.stringify(value)}]});await expect(rerankWithLLM('q',['a','b'],'test','small',signal())).rejects.toThrow();expect(state.chat).toHaveBeenCalledOnce()
})
it('retains omitted candidates in original retrieval order, and rejects oversized input before contacting a provider',async()=>{
 state.chat.mockResolvedValue({contentParts:[{type:'text',text:'{"ranking":[{"index":1,"score":0.8}]}'}]})
 expect(await rerankWithLLM('q',['a','b','c'],'test','small',signal())).toEqual([{index:1,score:0.8},{index:0,score:0},{index:2,score:0}]);state.chat.mockClear()
 await expect(rerankWithLLM('q',Array(21).fill('a'),'test','small',signal())).rejects.toThrow('limit');expect(state.chat).not.toHaveBeenCalled()
})
it('does not return late results after cancellation or provider changes',async()=>{
 const controller=new AbortController();state.chat.mockImplementation(async()=>{controller.abort();return{contentParts:[{type:'text',text:'{"ranking":[{"index":0,"score":1}]}'}]}})
 await expect(rerankWithLLM('q',['a'],'test','small',controller.signal)).rejects.toThrow()
 state.chat.mockImplementation(async()=>{state.provider.apiHost='https://changed.invalid';return{contentParts:[{type:'text',text:'{"ranking":[{"index":0,"score":1}]}'}]}})
 await expect(rerankWithLLM('q',['a'],'test','small',signal())).rejects.toThrow('settings changed')
})
it('rejects prose and tool calls instead of treating them as a validated ranking',async()=>{
 for(const parts of [[{type:'text',text:'Here is your JSON: {"ranking":[{"index":0,"score":1}]}'}],[{type:'tool-call',toolName:'web_search',input:{query:'secret'}}]]){state.chat.mockResolvedValue({contentParts:parts});await expect(rerankWithLLM('q',['a'],'test','small',signal())).rejects.toThrow()}
})
