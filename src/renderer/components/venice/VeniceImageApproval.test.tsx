// @vitest-environment jsdom
import NiceModal from '@ebay/nice-modal-react'
import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/platform', () => ({ default: { isDesktopLike: false } }))
vi.mock('@/hooks/useScreenChange', () => ({ useIsSmallScreen: () => false }))
import { VeniceImageApproval } from './VeniceImageApproval'
const models = [{ modelId: 'gpt-flare-image', displayName: 'GPT Flare', capabilities: { aspectRatio: { values: ['1:1'] }, inputReferences: null } }]
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('preselects the resolved requested model and approves per-call settings without generating', async () => {
  render(<MantineProvider><NiceModal.Provider /></MantineProvider>); let result: Promise<unknown>
  act(() => { result = NiceModal.show(VeniceImageApproval, { models, request: { modelId: 'gpt-flare-image', prompt: 'A sunset', count: 1 } }) })
  expect((await screen.findByLabelText("Venice image model", { selector: 'input' }) as HTMLInputElement).value).toBe('GPT Flare')
  fireEvent.click(screen.getByLabelText("Content filter", { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: "Off" }))
  fireEvent.click(screen.getByRole('button', { name: "Parameters for this call" })); fireEvent.change(screen.getByLabelText("Seed for this generation"), { target: { value: '42' } })
  fireEvent.click(screen.getByRole('button', { name: "Confirm and generate" }))
  expect(await result!).toMatchObject({ modelId: 'gpt-flare-image', prompt: 'A sunset', count: 1, extraBody: { safe_mode: false, seed: 42 } })
})
it('does not silently choose the first model when no name was supplied', async () => {
  render(<MantineProvider><NiceModal.Provider /></MantineProvider>); let result: Promise<unknown>
  act(() => { result = NiceModal.show(VeniceImageApproval, { models, request: { prompt: 'A scene', count: 1 } }) })
  expect((await screen.findByLabelText("Venice image model", { selector: 'input' }) as HTMLInputElement).value).toBe('')
  expect((screen.getByRole('button', { name: "Confirm and generate" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: "Cancel" })); expect(await result!).toBeNull()
})

it('clears the previous searchable model when reopening after resetting approvals',async()=>{
 render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let result:Promise<unknown>
 act(()=>{result=NiceModal.show(VeniceImageApproval,{models,request:{modelId:'gpt-flare-image',prompt:'first',count:1}})})
 expect((await screen.findByLabelText('Venice image model',{selector:'input'}) as HTMLInputElement).value).toBe('GPT Flare')
 fireEvent.click(screen.getByRole('button',{name:'Confirm and generate'}));await result!
 act(()=>{result=NiceModal.show(VeniceImageApproval,{models,request:{prompt:'second',count:1}})})
 expect((await screen.findByLabelText('Venice image model',{selector:'input'}) as HTMLInputElement).value).toBe('')
 expect((screen.getByRole('button',{name:'Confirm and generate'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(await result!).toBeNull()
})

it('switches the visible Qwen family to its reference endpoint before the user confirms',async()=>{
 const base='qwen-image-2-1-pro',edit=base+'-edit'
 const paired=[{modelId:base,displayName:'Qwen Image 2.1 Pro',vendorMetadata:{veniceType:'image',privacy:'anonymized'},capabilities:{aspectRatio:{values:['1:1']},inputReferences:null}},{modelId:edit,displayName:'Qwen Image 2.1 Pro',vendorMetadata:{veniceType:'inpaint',privacy:'anonymized'},capabilities:{aspectRatio:{values:['1:1']},inputReferences:{min:1,max:10}}}]
 render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let result:Promise<any>
 act(()=>{result=NiceModal.show(VeniceImageApproval,{models:paired,request:{modelId:base,prompt:'Combine these images',count:1}})})
 const files=await screen.findByLabelText('Images to edit or use as references',{selector:'input'})
 fireEvent.change(files,{target:{files:[new File(['first'],'first.png',{type:'image/png'}),new File(['second'],'second.png',{type:'image/png'})]}})
 await waitFor(()=>expect((screen.getByLabelText('Venice image model',{selector:'input'}) as HTMLInputElement).value).toContain(edit))
 expect(screen.getByText('The selected model and price apply to this reference-based generation.')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Confirm and generate'}))
 const approved=await result!
 expect(approved.modelId).toBe(edit)
 expect(approved.referenceImages).toHaveLength(2)
})

it('requires explicit model selection when reference editing changes privacy',async()=>{
 const rows=[{modelId:'paired',displayName:'Original model',vendorMetadata:{veniceType:'image',privacy:'private'},capabilities:{aspectRatio:null,inputReferences:null}},{modelId:'paired-edit',displayName:'Editor for references',vendorMetadata:{veniceType:'inpaint',privacy:'anonymized'},capabilities:{aspectRatio:null,inputReferences:{min:1,max:6}}}]
 render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let result:Promise<any>
 act(()=>{result=NiceModal.show(VeniceImageApproval,{models:rows,request:{modelId:'paired',prompt:'Edit my image',count:1}})})
 fireEvent.change(await screen.findByLabelText('Images to edit or use as references',{selector:'input'}),{target:{files:[new File(['image'],'ref.png',{type:'image/png'})]}})
 expect((screen.getByLabelText('Venice image model',{selector:'input'}) as HTMLInputElement).value).toBe('Original model')
 expect(screen.getByText(/different or undeclared privacy/)).toBeTruthy()
 expect((screen.getByRole('button',{name:'Confirm and generate'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByLabelText('Choose reference model',{selector:'input'}))
 fireEvent.click(screen.getAllByRole('option').find(row=>row.textContent?.includes('Editor for references'))!)
 expect((screen.getByLabelText('Venice image model',{selector:'input'}) as HTMLInputElement).value).toBe('Editor for references')
 expect((screen.getByRole('switch',{name:'Automatically select a compatible variant'}) as HTMLInputElement).checked).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'Confirm and generate'}));expect((await result!).modelId).toBe('paired-edit')
})

it('keeps the manually selected base model instead of silently replacing it again',async()=>{
 const rows=[{modelId:'paired',displayName:'Original model',vendorMetadata:{veniceType:'image',privacy:'private'},capabilities:{aspectRatio:null,inputReferences:null}},{modelId:'paired-edit',displayName:'Editor for references',vendorMetadata:{veniceType:'inpaint',privacy:'private'},capabilities:{aspectRatio:null,inputReferences:{min:1,max:6}}}]
 render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let result:Promise<any>
 act(()=>{result=NiceModal.show(VeniceImageApproval,{models:rows,request:{modelId:'paired',prompt:'Edit my image',count:1}})})
 fireEvent.change(await screen.findByLabelText('Images to edit or use as references',{selector:'input'}),{target:{files:[new File(['image'],'ref.png',{type:'image/png'})]}})
 await waitFor(()=>expect((screen.getByLabelText('Venice image model',{selector:'input'}) as HTMLInputElement).value).toBe('Editor for references'))
 fireEvent.click(screen.getByLabelText('Venice image model',{selector:'input'}))
 fireEvent.click(screen.getAllByRole('option').find(row=>row.textContent?.includes('Original model'))!)
 expect((screen.getByLabelText('Venice image model',{selector:'input'}) as HTMLInputElement).value).toBe('Original model')
 expect((screen.getByRole('button',{name:'Confirm and generate'}) as HTMLButtonElement).disabled).toBe(true)
 expect(screen.getByLabelText('Images to edit or use as references',{selector:'input'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(await result!).toBeNull()
})

it('shows requested negative and advanced image parameters, retaining edited values in the approval',async()=>{const rows=[{modelId:'wan-2-7-text-to-image',displayName:'Wan',vendorMetadata:{veniceType:'image',capabilities:{supportsTransparentBackground:true}},capabilities:{aspectRatio:{values:['1:1']},inputReferences:null}}];render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let result:Promise<any>;act(()=>{result=NiceModal.show(VeniceImageApproval,{models:rows,request:{modelId:rows[0].modelId,prompt:'A scene',count:1,extraBody:{negative_prompt:'blur',resolution:'2K',transparent_background:true}}})});const negative=await screen.findByLabelText('Elements to avoid');expect((negative as HTMLTextAreaElement).value).toBe('blur');expect((screen.getByLabelText('Extra parameters for this call (JSON)') as HTMLTextAreaElement).value).toContain('2K');fireEvent.change(negative,{target:{value:'blur, text'}});fireEvent.click(screen.getByRole('button',{name:'Confirm and generate'}));expect(await result!).toMatchObject({extraBody:{negative_prompt:'blur, text',resolution:'2K',transparent_background:true}})})
