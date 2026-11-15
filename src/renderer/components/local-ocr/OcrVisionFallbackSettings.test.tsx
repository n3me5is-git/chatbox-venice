// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {OcrVisionFallbackSettings} from './OcrVisionFallbackSettings'
vi.mock('@/components/AdaptiveSelect',()=>({AdaptiveSelect:(p:any)=><select aria-label={p.label} value={p.value} onChange={e=>p.onChange(e.target.value)}>{p.data.map((row:any)=><option key={row.value} value={row.value}>{row.label}</option>)}</select>}))
vi.mock('./OcrModelSelector',()=>({OcrModelSelector:(p:any)=><button onClick={()=>p.onSelect('custom','vlm')}>{p.visionOnly?'Vision models only':'All models'}</button>}))
afterEach(cleanup)
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})})
it('defaults to off and discloses the provider boundary before selecting a vision fallback',()=>{
 const change=vi.fn(),view=render(<MantineProvider><OcrVisionFallbackSettings onChange={change}/></MantineProvider>)
 expect(screen.queryByText('Vision models only')).toBeNull();fireEvent.change(screen.getByLabelText('Vision fallback for local OCR'),{target:{value:'always'}});expect(change).toHaveBeenLastCalledWith({mode:'always',provider:'',model:''})
 view.rerender(<MantineProvider><OcrVisionFallbackSettings value={{mode:'always',provider:'',model:''}} onChange={change}/></MantineProvider>);expect(screen.getByText(/Images and PDF pages may be sent/)).toBeTruthy();fireEvent.click(screen.getByText('Vision models only'));expect(change).toHaveBeenLastCalledWith({mode:'always',provider:'custom',model:'vlm'})
 fireEvent.change(screen.getByLabelText('Vision fallback for local OCR'),{target:{value:'off'}});expect(change).toHaveBeenLastCalledWith(undefined)
})
