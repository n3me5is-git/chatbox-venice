// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { translationResources } from '@chatbox/i18n'
import { markLocalFile } from '@/packages/local-file-origin'
const unlock=vi.hoisted(()=>vi.fn().mockResolvedValue(true))
vi.mock('@/components/security/requestUnlock',()=>({requestProtectedAccess:unlock}))
vi.mock('@/components/Image',()=>({ImageInStorage:({storageKey}:{storageKey:string})=><div data-testid="image-preview">{storageKey}</div>}))
vi.mock('@/components/security/ProtectedPreviewGate',()=>({ProtectedPreviewGate:({children,scope}:{children:React.ReactNode;scope?:string})=><div data-testid="scope">{scope}{children}</div>}))
import { VeniceImageTools } from './VeniceImageTools'
beforeEach(async()=>{unlock.mockClear();await i18n.use(initReactI18next).init({resources:translationResources,lng:'en',fallbackLng:'en'})})
afterEach(()=>cleanup())
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
Element.prototype.scrollIntoView=vi.fn()
const record={id:'result',prompt:'tool',createdAt:1,referenceImages:[],generatedImages:['saved-image'],model:{provider:'venice' as const,modelId:'background-remove'},status:'done' as const}
it('starts only after explicit confirmation and displays a saved output',async()=>{
 const process=vi.fn().mockResolvedValue(record);render(<MantineProvider><VeniceImageTools process={process}/></MantineProvider>)
 const button=screen.getByRole('button',{name:'Confirm and remove background'}) as HTMLButtonElement;expect(button.disabled).toBe(true)
 fireEvent.change(screen.getByLabelText('Source image',{selector:'input'}),{target:{files:[new File(['image'],'source.png',{type:'image/png'})]}})
 expect(process).not.toHaveBeenCalled();fireEvent.click(button)
 await waitFor(()=>expect(screen.getByTestId('image-preview').textContent).toBe('saved-image'))
 expect(process).toHaveBeenCalledTimes(1);expect(process.mock.calls[0][0]).toMatchObject({operation:'background-remove',protection:undefined})
})
it('inherits a protected source scope and asks to unlock it before processing',async()=>{
 const process=vi.fn().mockImplementation(async input=>({...record,protection:input.protection}));render(<MantineProvider><VeniceImageTools process={process}/></MantineProvider>)
 const file=markLocalFile(new File(['image'],'private.png',{type:'image/png'}),{scope:'project:dedicated',key:'source'})
 fireEvent.change(screen.getByLabelText('Source image',{selector:'input'}),{target:{files:[file]}});fireEvent.click(screen.getByRole('button',{name:'Confirm and remove background'}))
 await waitFor(()=>expect(process).toHaveBeenCalledTimes(1));expect(unlock).toHaveBeenCalledWith('project:dedicated');expect(process.mock.calls[0][0].protection).toBe('project:dedicated')
 expect((await screen.findByTestId('scope')).textContent).toContain('project:dedicated')
})
it('shows upscale prices and keeps a failed paid action at one attempt',async()=>{
 const process=vi.fn().mockRejectedValue(Error('HTTP 429'))
 render(<MantineProvider><VeniceImageTools catalog={[{id:'upscaler',type:'upscale',model_spec:{pricing:{upscale:{'2x':{usd:0.02},'4x':{usd:0.08}}}}}]} process={process}/></MantineProvider>)
 fireEvent.click(screen.getByLabelText('Upscale image'));expect(screen.getByText(/0.02 USD/)).toBeTruthy();fireEvent.click(screen.getByLabelText('4×'));expect(screen.getByText(/0.08 USD/)).toBeTruthy()
 fireEvent.change(screen.getByLabelText('Source image',{selector:'input'}),{target:{files:[new File(['image'],'source.png',{type:'image/png'})]}});fireEvent.click(screen.getByRole('button',{name:'Confirm and upscale'}))
 await screen.findByText('HTTP 429');expect(process).toHaveBeenCalledTimes(1);expect(process.mock.calls[0][0]).toMatchObject({operation:'upscale',scale:4})
})
