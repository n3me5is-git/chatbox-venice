// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({type:'desktop',external:vi.fn(async()=>{}),invoke:vi.fn(async()=>{})}))
vi.mock('@/platform',()=>({default:{get type(){return state.type},get isDesktopLike(){return state.type==='desktop'},openLink:state.external}}))
vi.mock('./VenicePricing',()=>({VenicePricing:()=>null}))
vi.mock('./VeniceModelBadges',()=>({VeniceModelBadges:()=>null}))
import { VeniceModelDetails } from './VeniceModelInfo'
Object.defineProperty(window,'matchMedia',{value:()=>({matches:false,addEventListener(){},removeEventListener(){}})})
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('opens the model card externally and keeps the endpoint guide as a separate action',async()=>{
 state.type='desktop';(window as any).electronAPI={invoke:state.invoke}
 render(<MantineProvider><VeniceModelDetails inline model={{id:'krea-2-turbo',type:'image'}} onClose={()=>{}}/></MantineProvider>)
 fireEvent.click(screen.getByText('Open in browser'))
 expect(state.external).toHaveBeenCalledWith('https://venice.ai/models/krea-2-turbo')
 fireEvent.click(screen.getByText('Open in Chrome'))
 expect(state.invoke).toHaveBeenCalledWith('openLink','https://venice.ai/models/krea-2-turbo',{browser:'chrome'})
 fireEvent.click(screen.getByText('API documentation'))
 expect(state.invoke).toHaveBeenCalledWith('openLink','https://docs.venice.ai/api-reference/endpoint/image/generate',{browser:'internal'})
})
it('hides the redundant Chrome command in the web application',()=>{
 state.type='web'
 render(<MantineProvider><VeniceModelDetails inline model={{id:'krea-2-turbo',type:'image'}} onClose={()=>{}}/></MantineProvider>)
 expect(screen.queryByText('Open in Chrome')).toBeNull()
 expect(screen.getByText('Open in browser')).toBeTruthy()
})
