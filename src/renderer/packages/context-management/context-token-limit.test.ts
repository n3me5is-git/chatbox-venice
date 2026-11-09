import { expect, it } from 'vitest'
import { getCompactionBudget } from '@chatbox/core/application/token-estimation/math'
import { ProviderModelInfoSchema, SessionSettingsSchema, SettingsSchema } from '@shared/types'
import { subscriptionDefaultModels } from '@shared/oauth/chatgpt-model-catalog'
import { checkOverflow } from './compaction-detector'
import { getConfiguredContextWindow } from './context-pressure'
import { createDefaultSettings } from '@chatbox/core/domain/settings/settings-defaults'
it('uses a 300K subscription ceiling before considering a lower user budget',()=>{
  expect(subscriptionDefaultModels().filter(m=>m.type==='chat').every(m=>m.contextWindow===300000)).toBe(true)
  expect(getConfiguredContextWindow({providers:{}},'openai-sub-unofficial','custom-gpt')).toBe(300000)
  expect(getCompactionBudget(300000)?.thresholdTokens).toBe(201000)
  expect(getCompactionBudget(300000,{contextTokenLimit:150000})?.thresholdTokens).toBe(88500)
  expect(getCompactionBudget(300000,{contextTokenLimit:900000})?.contextWindow).toBe(300000)
})
it('applies token caps to overflow checks and summary targets consistently',()=>{
  const result=checkOverflow({modelId:'custom',contextWindow:300000,tokens:90000,settings:{contextTokenLimit:150000,compactionThreshold:0.75}})
  expect(result).toMatchObject({isOverflow:true,contextWindow:150000,thresholdTokens:88500})
  expect(getCompactionBudget(300000,{contextTokenLimit:150000})?.targetTokens).toBe(59000)
})
it('persists global, session and per-model values through JSON schema roundtrips',()=>{
  expect(SettingsSchema.parse({...createDefaultSettings(),contextTokenLimit:100000}).contextTokenLimit).toBe(100000)
  expect(SessionSettingsSchema.parse({contextTokenLimit:150000}).contextTokenLimit).toBe(150000)
  expect(ProviderModelInfoSchema.parse({modelId:'custom',contextWindow:250000,subscriptionEndpoint:'responses'}).contextWindow).toBe(250000)
  expect(SessionSettingsSchema.parse({contextTokenLimit:-1}).contextTokenLimit).toBeUndefined()
})
