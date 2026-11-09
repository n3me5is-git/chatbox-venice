// @vitest-environment jsdom
import NiceModal from '@ebay/nice-modal-react'
import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProviderModelInfoSchema } from '@shared/types'
vi.mock('react-i18next', () => ({useTranslation:()=>({t:(value:string)=>value})}))
vi.mock('@/hooks/useScreenChange',()=>({useIsSmallScreen:()=>false}))
vi.mock('@/adapters',()=>({createModelDependencies:vi.fn()}))
vi.mock('@/utils/model-tester',()=>({testModelCapabilities:vi.fn()}))
vi.mock('@/platform',()=>({default:{isDesktopLike:false}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({customProviders:[]})},useProviderSettings:()=>({providerSettings:{}})}))
import ModelEdit from './ModelEdit'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});Element.prototype.scrollIntoView=vi.fn()})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('saves a custom image ID and its actual endpoint from the modal dropdown',async()=>{
  render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let saved!:Promise<unknown>
  act(()=>{saved=NiceModal.show(ModelEdit,{providerId:'openai-sub-unofficial',model:{modelId:'custom-image-2.6',type:'image'}})})
  fireEvent.click(await screen.findByLabelText('Subscription request endpoint',{selector:'input'}));fireEvent.click(screen.getByRole('option',{name:'Images API · /images/generations and /images/edits'}))
  fireEvent.click(screen.getByRole('button',{name:'Save'}));expect(ProviderModelInfoSchema.parse(await saved)).toMatchObject({modelId:'custom-image-2.6',type:'image',subscriptionEndpoint:'images'})
})
it('persists custom thinking options rather than losing the selection on close',async()=>{
  render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let saved!:Promise<unknown>
  act(()=>{saved=NiceModal.show(ModelEdit,{providerId:'openai-sub-unofficial',model:{modelId:'future-text',type:'chat',capabilities:['reasoning'],vendorMetadata:{codexReasoningEfforts:['low','high','max']}}})})
  fireEvent.click(await screen.findByLabelText('Supported thinking levels',{selector:'input'}));fireEvent.click(screen.getByRole('option',{name:'xhigh'}))
  const contextInput = screen.getByPlaceholderText('e.g. 128000')
  expect((contextInput as HTMLInputElement).value).toBe('300,000')
  fireEvent.change(contextInput,{target:{value:'180000'}})
  fireEvent.click(screen.getByRole('button',{name:'Save'}));const model=ProviderModelInfoSchema.parse(await saved);expect(model.vendorMetadata?.codexReasoningEfforts).toEqual(['low','high','max','xhigh']);expect(model.subscriptionEndpoint).toBe('responses');expect(model.contextWindow).toBe(180000)
})
