// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { SessionResource } from '@shared/session-resources'
import { closeTopSurface } from '@/packages/overlay-back'
import { SessionResources } from './SessionResources'
vi.mock('@/platform',()=>({default:{openLink:vi.fn()}}))
vi.mock('@/packages/session-resources/service',()=>({exportSessionResource:vi.fn(),listSessionResources:vi.fn(),readSessionResource:vi.fn(),removeSessionResource:vi.fn(),saveSessionResource:vi.fn(),subscribeSessionResources:vi.fn()}))
vi.mock('@/packages/session-resources/files',()=>({sessionFiles:{write:vi.fn(),deliver:vi.fn()}}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:({opened,children,title}:any)=>opened?<div role="dialog" aria-label={title}>{children}</div>:null}))
vi.mock('@/components/Mermaid',()=>({MessageMermaid:()=>null}))
vi.mock('react-i18next',()=>({useTranslation:()=>({})}))
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
afterEach(cleanup)
function fixture(){
  let files:SessionResource[]=[{id:'one',path:'notes.md',name:'notes.md',mime:'text/markdown',origin:'file',bytes:10},{id:'two',path:'output/data.json',name:'data.json',mime:'application/json',origin:'file',bytes:2}]
  const api={list:vi.fn(async()=>({items:files,truncated:false})),read:vi.fn(async()=>({bytes:new TextEncoder().encode('# Notes'),file:files[0]})),save:vi.fn(async()=>{}),remove:vi.fn(async(_id:string,item:SessionResource)=>{files=files.filter(file=>file.id!==item.id)}),export:vi.fn(async()=>{}),subscribe:vi.fn(()=>()=>{}),create:vi.fn(async()=>files[0]),deliver:vi.fn(async()=>files[0])}
  render(<MantineProvider><SessionResources sessionId="session-one" api={api as ComponentProps<typeof SessionResources>['api']}/></MantineProvider>)
  return api
}
it('lists metadata without reading bodies; opens and edits only the selected file',async()=>{
  const api=fixture();await screen.findByRole('button',{name:/^notes.md/});expect(api.read).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:/^notes.md/}));await screen.findByRole('heading',{name:'Notes'});expect(api.read).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button',{name:'Edit file'}));fireEvent.change(screen.getByRole('textbox',{name:'File content'}),{target:{value:'# Updated\nNext line'}})
  fireEvent.click(screen.getByRole('button',{name:'Save file'}));await waitFor(()=>expect(api.save).toHaveBeenCalledWith('session-one',expect.objectContaining({id:'one'}),'# Updated\nNext line'))
})
it('requires a confirmation and deletes only the chosen file',async()=>{
  const api=fixture();await screen.findByRole('button',{name:/^notes.md/})
  fireEvent.click(screen.getByRole('button',{name:'Delete resource: notes.md'}));expect(api.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Delete'}));await waitFor(()=>expect(api.remove).toHaveBeenCalledTimes(1))
  await waitFor(()=>expect(screen.queryByRole('button',{name:/^notes.md/})).toBeNull());expect(screen.getByRole('button',{name:/data.json/})).toBeTruthy()
})
it('native Back closes a file preview before leaving the explorer',async()=>{
  fixture();fireEvent.click(await screen.findByRole('button',{name:/^notes.md/}));await screen.findByRole('heading',{name:'Notes'})
  expect(closeTopSurface()).toBe(true);await screen.findByRole('textbox',{name:'Search session files'})
})
