// @vitest-environment jsdom
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
const state=vi.hoisted(()=>({guests:new Map<string,any>(),listeners:new Set<()=>void>(),version:0,post:vi.fn(),configure:vi.fn(),answer:vi.fn(),clone:vi.fn(),stop:vi.fn(),read:vi.fn()}))
vi.mock('@/packages/collaboration/runtime',()=>({collaboration:{...state,subscribe:(listener:()=>void)=>{state.listeners.add(listener);return()=>state.listeners.delete(listener)},getVersion:()=>state.version,async *readFile(...args:any[]){state.read(...args);yield Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/T9sAAAAASUVORK5CYII='),c=>c.charCodeAt(0))}},switchCurrentSession:vi.fn()}))
vi.mock('@/platform',()=>({default:{type:'web',openLink:vi.fn()}}))
vi.mock('react-virtuoso',()=>({Virtuoso:({data,itemContent}:any)=><div>{data.map((item:any,index:number)=><div key={item.id}>{itemContent(index,item)}</div>)}</div>}))
import { RemoteChat } from './RemoteChat'
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}))})
global.ResizeObserver=class {observe(){}unobserve(){}disconnect(){}}
HTMLElement.prototype.scrollIntoView=vi.fn();URL.createObjectURL=vi.fn(()=> 'blob:remote-preview');URL.revokeObjectURL=vi.fn()
const room=()=>({id:'remote',name:'Alice',status:'connected',permissions:{write:false,interact:false,clone:false},hitls:[],pending:new Map(),busy:false,snapshot:{title:'Shared conversation',revision:1,truncated:false,controls:{revision:'r',model:'Host GLM',thinking:'default',thinkingOptions:['default','high'],webBrowsing:false,venice:{webSearch:'auto',webSearchEnabled:true,searchProvider:'brave',searchToolMode:'selected',webCitations:true,webScraping:false,xSearch:false}},messages:[{id:'one',role:'user',text:'Visible prompt',author:{id:'verified-alice',name:'Alice'}},{id:'two',role:'assistant',text:'Live reply',generating:true,tools:[{id:'tool',name:'mcp_lookup',state:'running',detail:'{"query":"test"}'}]},{id:'old',role:'user',text:'Archived branch',archived:true}],files:[{id:'picture',name:'pixel.png',path:'images/pixel.png',mime:'image/png'}]}})
beforeEach(()=>{vi.clearAllMocks();state.guests.clear();state.guests.set('remote',room());state.version++})
afterEach(cleanup)
const mount=()=>render(<MantineProvider><RemoteChat roomId="remote" onManage={vi.fn()} onLeave={vi.fn()}/></MantineProvider>)
const update=()=>act(()=>{state.version++;state.listeners.forEach(listener=>listener())})
it('renders a complete remote transcript with authors and live tools, without model selection or local execution',()=>{
  mount();expect(screen.getByText('Visible prompt')).toBeTruthy();expect(screen.getByText('Live reply')).toBeTruthy();expect(screen.getByText(/Alice · verified/)).toBeTruthy();expect(screen.getByText(/mcp_lookup/)).toBeTruthy();expect(screen.getByText('Read-only access')).toBeTruthy()
  expect(screen.queryByText('Archived branch')).toBeNull();expect(screen.queryByRole('textbox',{name:'Message'})).toBeNull();expect(state.post).not.toHaveBeenCalled();expect(state.read).not.toHaveBeenCalled()
})
it('sends to the host by default when permitted, preserves multiline Enter, and removes controls after revocation',async()=>{
  const guest=state.guests.get('remote');guest.permissions={write:true,interact:true,clone:false};mount()
  const input=screen.getByRole('textbox',{name:'Message'});fireEvent.change(input,{target:{value:'A shared request'}});fireEvent.keyDown(input,{key:'Enter'});expect(state.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Send to AI'}));await waitFor(()=>expect(state.post).toHaveBeenCalledWith('remote','A shared request',true))
  guest.permissions.write=false;guest.permissions.interact=false;update();expect(screen.queryByRole('textbox',{name:'Message'})).toBeNull()
})
it('forwards thinking and search selections through the host control operation, and previews files only on demand',async()=>{
  state.guests.get('remote').permissions={write:true,interact:true,clone:false};mount();fireEvent.click(screen.getByRole('button',{name:'Remote chat settings'}))
  fireEvent.click(await screen.findByLabelText('Chatbox web search'));await waitFor(()=>expect(state.configure).toHaveBeenCalledWith('remote',{webBrowsing:true}))
  fireEvent.click(screen.getByRole('textbox',{name:'Thinking Effort'}));fireEvent.click(await screen.findByRole('option',{name:'High'}));await waitFor(()=>expect(state.configure).toHaveBeenCalledWith('remote',{thinking:'high'}))
  fireEvent.click(screen.getByRole('button',{name:'Close'}));fireEvent.click(screen.getByRole('button',{name:'Shared files'}));expect(state.read).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('button',{name:'images/pixel.png'}));expect(await screen.findByAltText('pixel.png')).toBeTruthy();expect(state.read).toHaveBeenCalledOnce()
})
