import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({create:vi.fn(),chat:vi.fn(),saved:{apiKey:'fixture',models:[{modelId:'qwen3-5-35b-a3b',capabilities:['reasoning'],vendorMetadata:{capabilities:{supportsReasoning:true,supportsReasoningEffort:true,reasoningEffortOptions:['none','low','medium','high']}}}]}}))
vi.mock('@/adapters',()=>({createModel:async(settings:unknown)=>{state.create(settings);return {chat:state.chat}}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>({providers:{venice:state.saved}})})}}))
import {knowledgeJson} from './llm'
beforeEach(()=>{vi.clearAllMocks();state.chat.mockResolvedValue({contentParts:[{type:'text',text:'{"claims":[]}' }]})})
it('sends concise review options to the actual chat call without changing persisted chat settings',async()=>{await knowledgeJson({provider:'venice',model:'qwen3-5-35b-a3b'},'Review',{},new AbortController().signal,undefined,'concise');expect(state.create).toHaveBeenCalledWith(expect.objectContaining({maxTokens:4096,providerOptionsByModel:{'venice:qwen3-5-35b-a3b':{openaiCompatible:{reasoningEffort:'none'}}}}));expect(state.chat.mock.calls[0][1].providerOptions).toEqual({openaiCompatible:{reasoningEffort:'none'}})})
it('preserves the provider default for automatic review and unknown model capabilities',async()=>{await knowledgeJson({provider:'venice',model:'qwen3-5-35b-a3b'},'Review',{},new AbortController().signal);expect(state.create.mock.calls[0][0]).not.toHaveProperty('providerOptionsByModel');await knowledgeJson({provider:'venice',model:'unknown'},'Review',{},new AbortController().signal,undefined,'concise');expect(state.create.mock.calls[1][0]).not.toHaveProperty('providerOptionsByModel')})
it('forwards provider-returned reasoning updates and preserves the independent JSON answer',async()=>{
 state.chat.mockImplementationOnce(async(_messages,options)=>{options.onResultChange({contentParts:[{type:'reasoning',text:'Compare the supplied dates'}]});return{contentParts:[{type:'reasoning',text:'The dates agree'},{type:'text',text:'{"claims":[]}'}]}})
 const trace=vi.fn(),result=await knowledgeJson({provider:'venice',model:'qwen3-5-35b-a3b'},'Review',{},new AbortController().signal,undefined,'auto',undefined,trace)
 expect(trace.mock.calls.map(call=>call[0])).toEqual(['Compare the supplied dates','The dates agree']);expect(result).toEqual({claims:[]})
})
