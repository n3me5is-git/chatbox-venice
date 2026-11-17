// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({assert:vi.fn(),readEvidence:vi.fn(),authorize:vi.fn(),notify:()=>{},unsub:vi.fn()}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:{assert:f.assert,readEvidence:f.readEvidence,authorize:f.authorize,vault:{keys:{subscribe:(fn:()=>void)=>{f.notify=fn;return f.unsub}}}}}))
import {KnowledgeCitation} from './KnowledgeCitation'
const href='https://chatbox.invalid/knowledge/-1/2/'+'a'.repeat(64)
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});f.assert.mockResolvedValue(undefined);f.readEvidence.mockResolvedValue({name:'Report.pdf',before:'Before',quote:'Exact private excerpt',after:'After',page:3})})
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()})
it('previews already authorized source text without unlocking, and erases it when keys change',async()=>{
 render(<MantineProvider><KnowledgeCitation href={href}/></MantineProvider>);fireEvent.focus(screen.getByRole('link',{name:'Open source excerpt'}));await act(async()=>{await vi.advanceTimersByTimeAsync(350)})
 expect(screen.getByText('Exact private excerpt')).toBeTruthy();expect(f.authorize).not.toHaveBeenCalled();expect(f.assert).toHaveBeenCalledWith(-1)
 act(()=>f.notify());expect(screen.queryByText('Exact private excerpt')).toBeNull();expect(f.unsub).toHaveBeenCalled()
})
it('ignores an excerpt that completes after hover closes',async()=>{
 let finish!:(value:any)=>void;f.readEvidence.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}));render(<MantineProvider><KnowledgeCitation href={href}/></MantineProvider>);const link=screen.getByRole('link',{name:'Open source excerpt'});fireEvent.focus(link);await act(async()=>{await vi.advanceTimersByTimeAsync(350)});fireEvent.blur(link);await act(async()=>finish({name:'Report',quote:'Late private text'}));expect(screen.queryByText('Late private text')).toBeNull()
})
