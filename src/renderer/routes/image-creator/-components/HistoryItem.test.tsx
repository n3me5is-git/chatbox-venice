// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Modal } from '@/components/layout/Overlay'
import { afterEach,expect,it,vi } from 'vitest'
const blob=vi.hoisted(()=>vi.fn<(key?:string)=>{data:string;isError:boolean}>(()=>({data:'data:image/webp;base64,AAAA',isError:false})))
vi.mock('@/hooks/useBlob',()=>({useBlob:blob}))
import { HistoryItem } from './HistoryItem'
import type { ImageGeneration } from '@shared/types'
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
const record:ImageGeneration={id:'one',prompt:'A saved image',referenceImages:[],generatedImages:['original-large'],model:{provider:'venice',modelId:'image'},status:'done',createdAt:1}
afterEach(()=>{cleanup();blob.mockClear();vi.useRealTimers()})
const show=(value:ImageGeneration)=>render(<MantineProvider><HistoryItem record={value} isActive={false} modelDisplayName="Image model" onClick={()=>{}} onDelete={()=>{}}/></MantineProvider>)
it('uses a placeholder instead of reading the full image when a legacy record has no small thumbnail',()=>{show({...record,generatedImageThumbnails:['original-large']});expect(blob).not.toHaveBeenCalled()})
it('loads only the dedicated small thumbnail when one is available',()=>{show({...record,generatedImageThumbnails:['small-thumbnail']});expect(blob).toHaveBeenCalledWith('small-thumbnail');expect(blob.mock.calls.some(args=>args[0]==='original-large')).toBe(false)})
it('consumes Escape from a thumbnail context menu before parent window listeners',async()=>{
 const parentClose=vi.fn()
 function Parent(){const [opened,setOpened]=useState(true);return <Modal opened={opened} onClose={()=>{parentClose();setOpened(false)}} title="History parent"><HistoryItem record={record} isActive={false} isMobile modelDisplayName="Image model" onClick={()=>{}} onDelete={()=>{}}/></Modal>}
 render(<MantineProvider env="test"><Parent/></MantineProvider>)
 const thumbnail=screen.getByRole('button',{name:'Preview A saved image'})
 thumbnail.focus();fireEvent.contextMenu(thumbnail)
 await waitFor(()=>expect(screen.getByRole('menu')).toBeTruthy())
 const competingWindowListener=vi.fn()
 window.addEventListener('keydown',competingWindowListener)
 try{
   fireEvent.keyDown(thumbnail,{key:'Escape',code:'Escape'})
   await waitFor(()=>expect(screen.queryByRole('menu')).toBeNull())
   expect(parentClose).not.toHaveBeenCalled()
   expect(competingWindowListener).not.toHaveBeenCalled()
   expect(screen.getByRole('dialog',{name:'History parent'})).toBeTruthy()
 }finally{window.removeEventListener('keydown',competingWindowListener)}
})
it('suppresses compatibility mouse events only after a completed long press',()=>{
 vi.useFakeTimers()
 const preview=vi.fn()
 render(<MantineProvider env="test"><HistoryItem record={record} isActive={false} isMobile modelDisplayName="Image model" onClick={preview} onDelete={()=>{}}/></MantineProvider>)
 const thumbnail=screen.getByRole('button',{name:'Preview A saved image'})
 fireEvent.pointerDown(thumbnail,{clientX:20,clientY:20,pointerType:'touch'})
 act(()=>vi.advanceTimersByTime(600))
 fireEvent.pointerUp(thumbnail)
 expect(fireEvent.touchEnd(thumbnail,{cancelable:true})).toBe(false)
 expect(screen.getByRole('menu')).toBeTruthy()
 fireEvent.click(thumbnail);expect(preview).not.toHaveBeenCalled()
 fireEvent.pointerDown(thumbnail,{clientX:20,clientY:20,pointerType:'touch'})
 fireEvent.pointerUp(thumbnail)
 expect(fireEvent.touchEnd(thumbnail,{cancelable:true})).toBe(true)
 fireEvent.click(thumbnail);expect(preview).toHaveBeenCalledTimes(1)
})
