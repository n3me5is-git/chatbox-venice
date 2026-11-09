import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(()=>({ native:vi.fn(), stream:vi.fn() }))
vi.mock('@/platform',()=>({default:{type:'mobile'}}))
vi.mock('@capacitor/core',()=>({CapacitorHttp:{request:state.native},registerPlugin:vi.fn()}))
vi.mock('@/native/stream-http',()=>({createNativeResponse:state.stream}))
vi.mock('@/native/background-stream',()=>({backgroundStreamPrototypeEnabled:false}))
import { createSubscriptionTransport } from '@shared/oauth/chatgpt-transport'
import { startChatGPTDeviceLogin, pollChatGPTDeviceLogin } from '@shared/oauth/chatgpt-subscription'
import type { ModelDependencies } from '@shared/types/adapters'
import { RendererRequestAdapter } from '@/adapters/RendererRequestAdapter'
import { apiRequest } from '@/utils/request'

const dependencies = {request:new RendererRequestAdapter(vi.fn(),apiRequest)} as unknown as ModelDependencies
const native = (data:unknown,status=200)=>({data:JSON.stringify(data),status,headers:{'content-type':'application/json'},url:'https://auth.openai.com'})
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn(()=>{throw Error('WebView fetch must not be used')}))})
afterEach(()=>vi.unstubAllGlobals())
it('completes device OAuth through the real Android request adapters, retaining pending statuses and form encoding',async()=>{
  state.native.mockResolvedValueOnce(native({device_auth_id:'synthetic-device',user_code:'PAIR-CODE',interval:5})).mockResolvedValueOnce(native({},403)).mockResolvedValueOnce(native({authorization_code:'synthetic-code',code_verifier:'synthetic-verifier'})).mockResolvedValueOnce(native({access_token:'synthetic-token',refresh_token:'synthetic-refresh'}))
  const transport=createSubscriptionTransport(dependencies)
  const code=await startChatGPTDeviceLogin(transport)
  expect(await pollChatGPTDeviceLogin(transport,code)).toBeUndefined()
  expect(await pollChatGPTDeviceLogin(transport,code)).toMatchObject({accessToken:'synthetic-token',refreshToken:'synthetic-refresh'})
  const exchange=state.native.mock.calls[3][0]
  expect(exchange.url).toBe('https://auth.openai.com/oauth/token')
  expect(exchange.headers['content-type']).toBe('application/x-www-form-urlencoded')
  expect(new URLSearchParams(exchange.data).get('code_verifier')).toBe('synthetic-verifier')
  expect(globalThis.fetch).not.toHaveBeenCalled()
})
it('returns native HTTP errors to the caller without retrying paid requests, and rejects foreign destinations',async()=>{
  state.native.mockResolvedValue(native({error:{message:'Account limit'}},429))
  const transport=createSubscriptionTransport(dependencies)
  const result=await transport('https://chatgpt.com/backend-api/codex/images/generations',{method:'POST',body:'{}'})
  expect(result.status).toBe(429);expect(await result.json()).toEqual({error:{message:'Account limit'}});expect(state.native).toHaveBeenCalledOnce()
  await expect(transport('https://foreign.example/request')).rejects.toThrow('destination');expect(state.native).toHaveBeenCalledOnce()
})
