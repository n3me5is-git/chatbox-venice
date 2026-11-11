// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VenicePrivacyStatus, VerifiedResponseStatus } from './VenicePrivacyStatus'
vi.mock('react-i18next',()=>({useTranslation:()=>({})}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:({opened,children}:any)=>opened?<div role="dialog">{children}</div>:null}))
Object.defineProperty(window,'matchMedia',{value:()=>({matches:false,addEventListener(){},removeEventListener(){}})})
afterEach(cleanup)
const model={modelId:'protected',vendorMetadata:{capabilities:{supportsE2EE:true}}}
const evidence={mode:'e2ee',receipt:'payload-bound',tools:'encrypted-text',modelId:'protected',verifiedAt:1700000000000,responses:2}
it('distinguishes an automatic requested mode from verification actually completed on a reply',()=>{
 render(<MantineProvider><VenicePrivacyStatus model={model}/><VerifiedResponseStatus value={evidence}/></MantineProvider>)
 expect(screen.getByText(/E2EE · Auto/)).toBeTruthy()
 fireEvent.click(screen.getByLabelText('Current chat privacy'))
 expect(screen.getByText(/not proof that a request has already passed verification/)).toBeTruthy()
 fireEvent.click(screen.getByText('Close'))
 fireEvent.click(screen.getByLabelText('Response security details'))
 expect(screen.getByText(/independently matched to the received payload/)).toBeTruthy()
 expect(screen.getByText(/Model hardware attestation relies on Venice verification/)).toBeTruthy()
})
it('marks gateway compatibility as limited and does not invent a badge for missing evidence',()=>{
 const view=render(<MantineProvider><VerifiedResponseStatus value={{...evidence,receipt:'gateway-signature-only'}}/></MantineProvider>)
 expect(screen.getByText(/Limited receipt verification/)).toBeTruthy()
 fireEvent.click(screen.getByLabelText('Response security details'))
 expect(screen.getByText(/independent binding to this exact response payload could not be established/)).toBeTruthy()
 view.rerender(<MantineProvider><VerifiedResponseStatus value={{mode:'e2ee'}}/></MantineProvider>)
 expect(screen.queryByLabelText('Response security details')).toBeNull()
})
it('honors explicitly disabled automatic encryption',()=>{
 render(<MantineProvider><VenicePrivacyStatus model={model} session={{veniceSecurity:{textPrivacy:'standard'}}}/></MantineProvider>)
 expect(screen.queryByLabelText('Current chat privacy')).toBeNull()
})
