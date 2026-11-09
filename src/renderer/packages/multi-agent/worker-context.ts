import { isAutoCompactionEnabled } from '@chatbox/core/application/context'
import { createModelMessageTokenCounter, textTokenCounter } from '@chatbox/core/generation'
import { asSchema, type ToolSet } from 'ai'
import { getTokenizerType } from '@shared/token-estimation/tokenizer'
import type { SessionSettings } from '@shared/types'
import { createModel } from '@/adapters'
import { settingsStore } from '@/stores/settingsStore'
import { getConfiguredContextWindow, getEffectiveMaxOutputTokens } from '@/packages/context-management/context-pressure'
import { resolveCompactionBudget } from '@/packages/context-management/compaction-detector'
import { WorkerContextController, summarizeWorkerMessages } from './context'

export async function createWorkerContext(settings:SessionSettings, tools:ToolSet, signal:AbortSignal, assert:()=>Promise<void>) {
  const global=settingsStore.getState().getSettings()
  const budget=resolveCompactionBudget(settings.modelId||'',{compactionThreshold:global.compactionThreshold,contextTokenLimit:settings.contextTokenLimit??global.contextTokenLimit},getConfiguredContextWindow(global,settings.provider,settings.modelId),getEffectiveMaxOutputTokens(global,settings.provider,settings.modelId,settings.maxTokens))
  const countText=textTokenCounter(getTokenizerType({provider:settings.provider||'',modelId:settings.modelId||''})),countMessage=createModelMessageTokenCounter(countText)
  let toolTokens=0
  for(const [name,member] of Object.entries(tools)) toolTokens+=countText(JSON.stringify({name,description:member.description,parameters:member.inputSchema?await asSchema(member.inputSchema).jsonSchema:undefined}))
  return new WorkerContextController({budget,automatic:isAutoCompactionEnabled(settings,global),signal,toolTokens,countMessage,summarize:async(messages,targetTokens)=>{
    signal.throwIfAborted();await assert()
    const model=await createModel({...settings,subscriptionWebSearch:false,maxTokens:Math.max(32,Math.min(4096,targetTokens))})
    return summarizeWorkerMessages({messages,budget:budget!,targetTokens,signal,model,assert,countText})
  }})
}
