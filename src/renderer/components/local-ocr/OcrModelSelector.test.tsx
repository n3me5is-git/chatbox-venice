// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {LOCAL_OCR_PROVIDER,LOCAL_OCR_MODELS} from '@shared/local-ocr'
const state=vi.hoisted(()=>({filter:undefined as any,desktop:true}))
vi.mock('@/components/ModelSelectorV2',()=>({default:(p:any)=>{state.filter=p.modelFilter;return <div>{p.children}<button onClick={()=>p.onSelect('custom','my-vlm')}>Pick custom VLM</button><button onClick={()=>p.onSelect('remote','vision')}>Remote model</button></div>}}))
vi.mock('@/packages/local-ocr/client',()=>({localOcrDesktop:()=>state.desktop}))
vi.mock('@/packages/paddle-ocr/client',()=>({paddleOcrAvailable:()=>true}))
vi.mock('./LocalOcrManager',()=>({LocalOcrManager:({onUse}:any)=><button onClick={()=>onUse(LOCAL_OCR_MODELS.q4)}>Use local Q4</button>}))
vi.mock('./PaddleOcrManager',()=>({PaddleOcrManager:()=>null}))
import {OcrModelSelector} from './OcrModelSelector'
afterEach(cleanup)
beforeEach(()=>{state.desktop=true;Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})})
it('accepts arbitrary provider vision models without matching any OCR model name',()=>{
 const select=vi.fn();render(<MantineProvider><OcrModelSelector onSelect={select} visionOnly/></MantineProvider>);expect(state.filter({modelId:'my-vlm',capabilities:['vision']})).toBe(true);expect(state.filter({modelId:'ocr-named-text-model',capabilities:[]})).toBe(false);fireEvent.click(screen.getByText('Pick custom VLM'));expect(select).toHaveBeenCalledWith('custom','my-vlm');expect(screen.queryByText('Set up local PaddleOCR')).toBeNull();expect(screen.queryByText('Set up local MiniCPM OCR')).toBeNull()
})
it('selects local OCR explicitly and allows returning to a remote model',()=>{const select=vi.fn();render(<MantineProvider><OcrModelSelector onSelect={select}/></MantineProvider>);fireEvent.click(screen.getByText('Set up local MiniCPM OCR'));fireEvent.click(screen.getByText('Use local Q4'));expect(select).toHaveBeenLastCalledWith(LOCAL_OCR_PROVIDER,LOCAL_OCR_MODELS.q4);fireEvent.click(screen.getByText('Remote model'));expect(select).toHaveBeenLastCalledWith('remote','vision')})
it('does not expose desktop setup on mobile and explains an imported desktop selection',()=>{state.desktop=false;render(<MantineProvider><OcrModelSelector value={{provider:LOCAL_OCR_PROVIDER,model:LOCAL_OCR_MODELS.q4}} onSelect={vi.fn()}/></MantineProvider>);expect(screen.queryByText('Set up local MiniCPM OCR')).toBeNull();expect(screen.getByText('Local MiniCPM OCR is available on desktop only')).toBeTruthy()})
it('shows the configured local quantization in the selector',()=>{render(<MantineProvider><OcrModelSelector value={{provider:LOCAL_OCR_PROVIDER,model:LOCAL_OCR_MODELS.q8}} onSelect={vi.fn()}/></MantineProvider>);expect(screen.getByText('MiniCPM-OCR Q8 · On this computer')).toBeTruthy()})
