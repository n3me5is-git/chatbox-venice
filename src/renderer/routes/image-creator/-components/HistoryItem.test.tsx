// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,render } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
const blob=vi.hoisted(()=>vi.fn<(key?:string)=>{data:string;isError:boolean}>(()=>({data:'data:image/webp;base64,AAAA',isError:false})))
vi.mock('@/hooks/useBlob',()=>({useBlob:blob}))
import { HistoryItem } from './HistoryItem'
import type { ImageGeneration } from '@shared/types'
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
const record:ImageGeneration={id:'one',prompt:'A saved image',referenceImages:[],generatedImages:['original-large'],model:{provider:'venice',modelId:'image'},status:'done',createdAt:1}
afterEach(()=>{cleanup();blob.mockClear()})
const show=(value:ImageGeneration)=>render(<MantineProvider><HistoryItem record={value} isActive={false} modelDisplayName="Image model" onClick={()=>{}} onDelete={()=>{}}/></MantineProvider>)
it('uses a placeholder instead of reading the full image when a legacy record has no small thumbnail',()=>{show({...record,generatedImageThumbnails:['original-large']});expect(blob).not.toHaveBeenCalled()})
it('loads only the dedicated small thumbnail when one is available',()=>{show({...record,generatedImageThumbnails:['small-thumbnail']});expect(blob).toHaveBeenCalledWith('small-thumbnail');expect(blob.mock.calls.some(args=>args[0]==='original-large')).toBe(false)})
