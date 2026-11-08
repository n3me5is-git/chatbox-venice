// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaRecord } from '@shared/providers/definitions/models/venice/media'
import type { MessageToolCallPart } from '@shared/types'
import { VeniceMediaArtifacts } from './VeniceMediaArtifacts'
vi.mock('@/platform',()=>({default:{type:'web'}}))
vi.mock('@/packages/venice/service',()=>({veniceMediaService:{}}))
vi.mock('@/packages/session-resources/api',()=>({sessionResourceAPI:{}}))
vi.mock('@/packages/vault/runtime',()=>({installedVaultFor:()=>undefined}))
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:({opened,children,title,onClose}:any)=>opened?<div role="dialog" aria-label={title}><button onClick={onClose}>Close</button>{children}</div>:null}))
vi.mock('@/components/security/ProtectedPreviewGate',async()=>{const {useState}=await import('react');return {ProtectedPreviewGate:({scope,children}:any)=>{const[allowed,setAllowed]=useState(false);return scope&&!allowed?<button onClick={()=>setAllowed(true)}>Unlock preview</button>:children}}})
const row:MediaRecord={id:'saved-media',sessionId:'chat',kind:'music',model:'music',prompt:'A saved song',createdAt:1,status:'ready',blobKey:'local-key',mime:'audio/mpeg',origin:'https://example.com',credentialId:'test'}
const parts=[{type:'tool-call',toolName:'venice_media',toolCallId:'tool',state:'result',args:{action:'generate'},result:{id:row.id,kind:row.kind}}] as MessageToolCallPart[]
const createUrl=vi.fn(()=>'blob:local-preview'),revokeUrl=vi.fn()
beforeEach(()=>{createUrl.mockClear();revokeUrl.mockClear();URL.createObjectURL=createUrl;URL.revokeObjectURL=revokeUrl;Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})})})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
function fixture(initial:MediaRecord[]= [{...row}]){
 let rows=initial;const listeners=new Set<()=>void>(),bytes=new Uint8Array([1,2,3])
 const service={list:vi.fn(async()=>structuredClone(rows)),subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}}
 const api={read:vi.fn(async(_session:string,item:any)=>({file:item,bytes})),export:vi.fn(async()=>{})}
 const view=render(<MantineProvider><VeniceMediaArtifacts parts={parts} sessionId="chat" service={service} api={api}/></MantineProvider>)
 return{service,api,view,bytes,change:(next:MediaRecord[])=>{rows=next;for(const listener of listeners)listener()}}
}
describe('chat media artifact player journeys',()=>{
 it('loads metadata only until clicked, opens the local audio player, and releases bytes/URLs on close',async()=>{
  const f=fixture();const button=await screen.findByRole('button',{name:'Open generated Music'});expect(f.api.read).not.toHaveBeenCalled()
  fireEvent.click(button);const audio=await screen.findByLabelText('Generated audio') as HTMLAudioElement
  expect(audio.controls).toBe(true);expect(audio.autoplay).toBe(false);expect(audio.preload).toBe('metadata')
  expect(f.api.read).toHaveBeenCalledWith('chat',expect.objectContaining({id:'media:saved-media',key:'local-key'}));expect([...f.bytes]).toEqual([0,0,0])
  fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(screen.queryByRole('dialog')).toBeNull();expect(revokeUrl).toHaveBeenCalledWith('blob:local-preview')
 })
 it('uses the shared inline video viewer without autoplay',async()=>{fixture([{...row,kind:'video',mime:'video/mp4'}]);fireEvent.click(await screen.findByRole('button',{name:'Open generated Video'}));const video=await screen.findByLabelText('Generated video') as HTMLVideoElement;expect(video.controls).toBe(true);expect(video.autoplay).toBe(false);expect(video.hasAttribute('playsinline')).toBe(true)})
 it('updates a queued artifact on completion without reloading the chat or reading content early',async()=>{const f=fixture([{...row,status:'queued',blobKey:undefined}]);const button=await screen.findByRole('button',{name:'Open generated Music'}) as HTMLButtonElement;expect(button.disabled).toBe(true);await act(async()=>f.change([{...row}]));await waitFor(()=>expect(button.disabled).toBe(false));expect(f.api.read).not.toHaveBeenCalled()})
 it('ignores a stored result belonging to a different session',async()=>{const f=fixture([{...row,sessionId:'other'}]);await act(async()=>{});expect(screen.queryByRole('button',{name:'Open generated Music'})).toBeNull();expect(f.api.read).not.toHaveBeenCalled()})
 it('requires the protected preview gate before reading and dismisses playback on privacy lock',async()=>{const f=fixture([{...row,protection:'app'}]);fireEvent.click(await screen.findByRole('button',{name:'Open generated Music'}));expect(f.api.read).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Unlock preview'}));await screen.findByLabelText('Generated audio');act(()=>window.dispatchEvent(new Event('chatbox:privacy-lock')));expect(screen.queryByRole('dialog')).toBeNull();expect(revokeUrl).toHaveBeenCalled()})
 it('closes an open player when the underlying creation is deleted',async()=>{const f=fixture();fireEvent.click(await screen.findByRole('button',{name:'Open generated Music'}));await screen.findByLabelText('Generated audio');await act(async()=>f.change([]));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(revokeUrl).toHaveBeenCalled()})
 it('discards a late file read if protection changes while the player is opening',async()=>{const f=fixture();let finish:(value:any)=>void=()=>{};f.api.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));fireEvent.click(await screen.findByRole('button',{name:'Open generated Music'}));await waitFor(()=>expect(f.api.read).toHaveBeenCalled());await act(async()=>f.change([{...row,protection:'app'}]));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());await act(async()=>finish({file:{},bytes:f.bytes}));expect(createUrl).not.toHaveBeenCalled();expect([...f.bytes]).toEqual([0,0,0])})
})
