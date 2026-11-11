// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/i18n/fork',()=>({forkT:(key:string)=>key}))
import { ReferenceModelControl } from './ReferenceModelControl'
import { ImageCapabilityBadges } from './ImageCapabilityBadges'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}}))})})
afterEach(cleanup)
it('shows the selected endpoint, privacy and explicit chooser, and never approves the change itself',()=>{
 const choose=vi.fn(),automatic=vi.fn()
 render(<MantineProvider><ReferenceModelControl model={{modelId:'image',displayName:'My image model',vendorMetadata:{veniceType:'image',privacy:'private'}}} count={2} automatic onAutomaticChange={automatic} compatible={false} privacyChange onChoose={choose}/></MantineProvider>)
 expect(screen.getByText('My image model')).toBeTruthy();expect(screen.getByLabelText('Private')).toBeTruthy()
 expect(screen.getByText(/different or undeclared privacy/)).toBeTruthy();expect(choose).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Choose reference model'}));expect(choose).toHaveBeenCalledOnce()
 fireEvent.click(screen.getByRole('switch',{name:'Automatically select a compatible variant'}));expect(automatic).toHaveBeenCalledWith(false)
})
it('distinguishes style references from editing and uses the catalog input limit',()=>{
 const {rerender}=render(<MantineProvider><ImageCapabilityBadges metadata={{veniceType:'image',supportsStyleReferences:true,constraints:{maxStyleReferences:6}}}/></MantineProvider>)
 expect(screen.getByText(/Style references/)).toBeTruthy();expect(screen.queryByText('Image editing')).toBeNull()
 rerender(<MantineProvider><ImageCapabilityBadges metadata={{veniceType:'inpaint',constraints:{maxInputImages:16}}}/></MantineProvider>)
 expect(screen.getByText(/References/).textContent).toContain('16');expect(screen.getByText('Image editing')).toBeTruthy()
})
