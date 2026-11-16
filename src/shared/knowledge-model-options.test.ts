import {expect,it} from 'vitest'
import {knowledgeModelOptions} from './knowledge-model-options'
import {resolveReasoningProviderOptions} from './utils/reasoning-control'
const model={modelId:'z-ai-glm-5-3-flash',capabilities:['reasoning' as const,'vision' as const],vendorMetadata:{capabilities:{supportsReasoning:true,supportsReasoningEffort:false,supportsVision:true}}}
it('uses the supported Auto image mode for GLM without losing concise controls for text or other models',()=>{
 expect(resolveReasoningProviderOptions(knowledgeModelOptions('venice',model.modelId,model,'concise','image'),'venice',model.modelId)).toBeUndefined()
 expect(resolveReasoningProviderOptions(knowledgeModelOptions('venice',model.modelId,model,'concise','text'),'venice',model.modelId)).toEqual({openaiCompatible:{enable_thinking:false}})
 const other={...model,modelId:'another-vision'};expect(resolveReasoningProviderOptions(knowledgeModelOptions('venice',other.modelId,other,'concise','image'),'venice',other.modelId)).toEqual({openaiCompatible:{enable_thinking:false}})
})
