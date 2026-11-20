// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({assert:vi.fn(),readEvidence:vi.fn(),authorize:vi.fn(),notify:()=>{},unsub:vi.fn()}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:{assert:f.assert,readEvidence:f.readEvidence,authorize:f.authorize,vault:{keys:{subscribe:(fn:()=>void)=>{f.notify=fn;return f.unsub}}}}}))
import {KnowledgeCitation} from './KnowledgeCitation'
// jsdom has zero-sized targets; Mantine test mode disables hideDetached/transitions.
// https://mantine.dev/theming/mantine-provider/
const href='https://chatbox.invalid/knowledge/-1/2/'+'a'.repeat(64)
beforeEach(()=>{vi.clearAllMocks();Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});f.assert.mockResolvedValue(undefined);f.readEvidence.mockResolvedValue({name:'Report.pdf',before:'Before',quote:'Exact private excerpt',after:'After',page:3})})
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()})
it('previews already authorized source text without unlocking, and erases it when keys change',async()=>{
 render(<MantineProvider env="test"><KnowledgeCitation href={href}/></MantineProvider>);fireEvent.focus(screen.getByRole('link',{name:'Open source excerpt'}))
 expect(await screen.findByText('Exact private excerpt')).toBeTruthy();expect(f.authorize).not.toHaveBeenCalled();expect(f.assert).toHaveBeenCalledWith(-1)
 act(()=>f.notify());expect(screen.queryByText('Exact private excerpt')).toBeNull();expect(f.unsub).toHaveBeenCalled()
})
it('ignores an excerpt that completes after hover closes',async()=>{
 let finish!:(value:any)=>void;f.readEvidence.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}));render(<MantineProvider env="test"><KnowledgeCitation href={href}/></MantineProvider>);const link=screen.getByRole('link',{name:'Open source excerpt'});fireEvent.focus(link);await waitFor(()=>expect(f.readEvidence).toHaveBeenCalled());fireEvent.blur(link);await act(async()=>finish({name:'Report',quote:'Late private text'}));expect(screen.queryByText('Late private text')).toBeNull()
})
it('renders highlighted hover excerpts as Markdown and LaTeX without remote media or owner unlock',async()=>{
 f.readEvidence.mockResolvedValueOnce({name:'Formula.pdf',quote:'## Definition\n\n**Score**: $x^2$.\n\n![inert](https://tracker.invalid/pixel)',page:2})
 render(<MantineProvider env="test"><KnowledgeCitation href={href}/></MantineProvider>);fireEvent.focus(screen.getByRole('link',{name:'Open source excerpt'}));expect(await screen.findByRole('heading',{name:'Definition'})).toBeTruthy();expect(document.querySelector('.mantine-Popover-dropdown .katex')).toBeTruthy();expect(document.querySelector('.mantine-Popover-dropdown img')).toBeNull();expect(f.authorize).not.toHaveBeenCalled()
})
