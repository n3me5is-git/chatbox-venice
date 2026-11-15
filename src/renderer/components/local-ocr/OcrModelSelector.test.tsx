// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {LOCAL_OCR_PROVIDER,LOCAL_OCR_MODELS} from '@shared/local-ocr'
const state=vi.hoisted(()=>({desktop:true}))
vi.mock('@/packages/local-ocr/client',()=>({localOcrDesktop:()=>state.desktop}))
vi.mock('@/components/ModelSelectorV2',()=>({default:({onSelect,children}:any)=><div><button onClick={()=>onSelect('remote','vision')}>Remote model</button>{children}</div>}))
vi.mock('./LocalOcrManager',()=>({LocalOcrManager:({onUse}:any)=><button onClick={()=>onUse(LOCAL_OCR_MODELS.q4)}>Use local Q4</button>}))
import {OcrModelSelector} from './OcrModelSelector'
afterEach(cleanup)
beforeEach(()=>{state.desktop=true;Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})})
it('selects local OCR explicitly and allows returning to a remote model',()=>{const select=vi.fn();render(<MantineProvider><OcrModelSelector onSelect={select}/></MantineProvider>);fireEvent.click(screen.getByText('Set up local MiniCPM OCR'));fireEvent.click(screen.getByText('Use local Q4'));expect(select).toHaveBeenLastCalledWith(LOCAL_OCR_PROVIDER,LOCAL_OCR_MODELS.q4);fireEvent.click(screen.getByText('Remote model'));expect(select).toHaveBeenLastCalledWith('remote','vision')})
it('does not expose desktop setup on mobile and explains an imported desktop selection',()=>{state.desktop=false;render(<MantineProvider><OcrModelSelector value={{provider:LOCAL_OCR_PROVIDER,model:LOCAL_OCR_MODELS.q4}} onSelect={vi.fn()}/></MantineProvider>);expect(screen.queryByText('Set up local MiniCPM OCR')).toBeNull();expect(screen.getByText('Local MiniCPM OCR is available on desktop only')).toBeTruthy()})
