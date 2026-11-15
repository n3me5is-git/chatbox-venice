// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {afterEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({filter:undefined as any}))
vi.mock('@/components/ModelSelectorV2',()=>({default:(p:any)=>{state.filter=p.modelFilter;return <div>{p.children}<button onClick={()=>p.onSelect('custom','my-vlm')}>Pick custom VLM</button></div>}}))
vi.mock('@/packages/local-ocr/client',()=>({localOcrDesktop:()=>true}))
vi.mock('@/packages/paddle-ocr/client',()=>({paddleOcrAvailable:()=>true}))
vi.mock('./LocalOcrManager',()=>({LocalOcrManager:()=>null}))
vi.mock('./PaddleOcrManager',()=>({PaddleOcrManager:()=>null}))
import {OcrModelSelector} from './OcrModelSelector'
afterEach(cleanup)
it('accepts arbitrary provider vision models without matching any OCR model name',()=>{
 const select=vi.fn();render(<MantineProvider><OcrModelSelector onSelect={select} visionOnly/></MantineProvider>);expect(state.filter({modelId:'my-vlm',capabilities:['vision']})).toBe(true);expect(state.filter({modelId:'ocr-named-text-model',capabilities:[]})).toBe(false);fireEvent.click(screen.getByText('Pick custom VLM'));expect(select).toHaveBeenCalledWith('custom','my-vlm');expect(screen.queryByText('Set up local PaddleOCR')).toBeNull();expect(screen.queryByText('Set up local MiniCPM OCR')).toBeNull()
})
