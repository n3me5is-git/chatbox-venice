// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import { afterEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({mobile:false,select:vi.fn(),ui:{modelSelectorTab:'all',setModelSelectorTab:vi.fn()},settings:{hideChatboxProviders:true,favoritedModels:[],chatboxAIExcludedModels:[]}}))
vi.mock('react-i18next',async original=>({...await original<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key,i18n:{language:'en',resolvedLanguage:'en'}})}))
vi.mock('@/platform',()=>({default:{type:'web',isDesktopLike:false,openLink:vi.fn()}}))
vi.mock('@/analytics/model-selection',()=>({trackListModelClick:vi.fn(),trackSelectModelClick:vi.fn(),trackUpgradeModelClick:vi.fn()}))
vi.mock('@/hooks/useScreenChange',()=>({useIsSmallScreen:()=>state.mobile}))
vi.mock('@/hooks/useChatboxAIModels',()=>({default:()=>({chatboxAIModels:[],chatboxAIModelList:null})}))
vi.mock('@/stores/settingsStore',()=>({useSettingsStore:(selector:any)=>selector(state.settings)}))
vi.mock('@/stores/uiStore',()=>({useUIStore:(selector:any)=>selector(state.ui)}))
vi.mock('@/hooks/useProviders',()=>({useProviders:()=>({providers:[{id:'venice',name:'Venice',models:[{modelId:'e2ee-test',nickname:'Selected protected model with a long complete name',type:'chat',capabilities:['reasoning','tool_use'],vendorMetadata:{veniceType:'text',privacy:'private',capabilities:{supportsE2EE:true}}}]}],favoritedModels:[],favoriteModel:vi.fn(),unfavoriteModel:vi.fn(),isFavoritedModel:()=>false})}))
vi.mock('../icons/ModelIcon',()=>({ModelIcon:()=>null}))
vi.mock('../icons/ProviderIcon',()=>({default:()=>null}))
vi.mock('../venice/VenicePricing',()=>({VenicePricing:()=>null}))
import ModelSelector from './index'
Object.defineProperty(window,'matchMedia',{writable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}})})
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
HTMLElement.prototype.scrollIntoView=vi.fn()
afterEach(()=>{cleanup();vi.clearAllMocks()})
it.each([false,true])('pins the current model inside the picker and opens its actual details without changing selection, mobile=%s',async mobile=>{
  state.mobile=mobile
  render(<Provider><MantineProvider><style>{'[data-vaul-drawer], [data-vaul-overlay] { animation-name:none!important; }'}</style><ModelSelector selectedProviderId="venice" selectedModelId="e2ee-test" onSelect={state.select}><button>Choose model</button></ModelSelector></MantineProvider></Provider>)
  expect(screen.queryByLabelText('Selected model details')).toBeNull()
  fireEvent.click(screen.getByText('Choose model'))
  const details=await screen.findByLabelText('Selected model details')
  expect(details.closest('[data-selected-model]')?.textContent).toContain('Selected protected model with a long complete name')
  fireEvent.change(screen.getByPlaceholderText('Search models'),{target:{value:'no matching model'}})
  expect(screen.getByText('Currently selected')).toBeTruthy()
  fireEvent.click(details)
  await waitFor(()=>expect(screen.getByText('Options allowed by the catalog')).toBeTruthy())
  expect(screen.getByText('Technical catalog data')).toBeTruthy()
  expect(state.select).not.toHaveBeenCalled()
})
