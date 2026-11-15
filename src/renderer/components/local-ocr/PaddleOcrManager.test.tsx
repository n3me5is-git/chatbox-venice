// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {PADDLE_OCR_MODEL,type PaddleOcrStatus} from '@shared/paddle-ocr'
const state=vi.hoisted(()=>({status:undefined as PaddleOcrStatus|undefined,control:vi.fn()}))
vi.mock('@/platform',()=>({default:{openLink:vi.fn()}}))
vi.mock('@/hooks/useScreenChange',()=>({useIsSmallScreen:()=>true}))
vi.mock('@/packages/local-ocr/client',()=>({localOcrDesktop:()=>false}))
vi.mock('@/packages/paddle-ocr/client',()=>({paddleOcrStatus:async()=>state.status,paddleOcrControl:(...args:any[])=>state.control(...args),recognizePaddle:vi.fn()}))
import {PaddleOcrManager} from './PaddleOcrManager'
import {closeTopSurface} from '@/packages/overlay-back'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
beforeEach(()=>{HTMLElement.prototype.scrollIntoView=vi.fn();state.status={config:{backend:'cpu',threads:4,idleSeconds:120},ready:true,loaded:false,starting:false,pending:0,busy:false,root:'/private/app/paddle-ocr',platformSupported:true};state.control.mockReset().mockImplementation(async(command,config)=>command==='configure'?({...state.status,config}):state.status);Object.defineProperty(window,'matchMedia',{configurable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
it('selects GPU in the modal dropdown, saves on Apply and uses the installed model on mobile',async()=>{const use=vi.fn();render(<MantineProvider><PaddleOcrManager onClose={vi.fn()} onUse={use}/></MantineProvider>);const hardware=await screen.findByLabelText('Processing hardware',{selector:'input'});fireEvent.click(hardware);fireEvent.click(await screen.findByRole('option',{name:'GPU (Vulkan)'}));expect(state.control).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Apply processing settings'));await waitFor(()=>expect(state.control).toHaveBeenCalledWith('configure',{backend:'vulkan',threads:4,idleSeconds:120}));fireEvent.click(screen.getByText('Use this OCR model'));expect(use).toHaveBeenCalledWith(PADDLE_OCR_MODEL)})
it('does not offer an unavailable model for use before installation',async()=>{state.status!.ready=false;render(<MantineProvider><PaddleOcrManager onClose={vi.fn()} onUse={vi.fn()}/></MantineProvider>);await screen.findByText('Download engine and language model');expect((screen.getByText('Use this OCR model').closest('button') as HTMLButtonElement).disabled).toBe(true);expect((screen.getByText('Test OCR with an image').closest('button') as HTMLButtonElement).disabled).toBe(true)})
it('registers the mobile panel for native Back and releases its handler on close',async()=>{const close=vi.fn(),view=render(<MantineProvider><PaddleOcrManager onClose={close} onUse={vi.fn()}/></MantineProvider>);await screen.findByText('Use this OCR model');act(()=>{expect(closeTopSurface()).toBe(true)});expect(close).toHaveBeenCalledOnce();view.unmount();expect(closeTopSurface()).toBe(false)})
