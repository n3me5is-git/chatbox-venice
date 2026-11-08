// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { useState } from 'react'
import { SettingsSchema,type Settings } from '@shared/types'
import { createDefaultSettings } from '@chatbox/core/domain/settings'
import { VeniceWebSearchSettings } from './VeniceWebSearchSettings'
Object.defineProperty(window,'matchMedia',{writable:true,value:()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})})
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});Element.prototype.scrollIntoView=vi.fn()})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('selects and persists separate global tools independently from Venice model settings',()=>{
  let saved:Settings={...createDefaultSettings(),providers:{venice:{venice:{searchToolMode:'selected'}}}}
  saved.extension.webSearch={provider:'venice',veniceSearchProvider:'brave'}
  function Controls(){const[value,setValue]=useState(saved.extension.webSearch);return <VeniceWebSearchSettings value={value} onChange={patch=>{saved=SettingsSchema.parse({...saved,extension:{...saved.extension,webSearch:{...value,...patch}}});setValue(saved.extension.webSearch)}}/>}
  const view=render(<MantineProvider><Controls/></MantineProvider>)
  fireEvent.click(screen.getByRole('switch',{name:'Expose separate search engines'}))
  fireEvent.click(screen.getByRole('textbox',{name:'Search engine through Venice'}));fireEvent.click(screen.getByRole('option',{name:'Google'}))
  expect(saved.extension.webSearch).toMatchObject({provider:'venice',veniceSearchToolMode:'separate',veniceSearchProvider:'google'})
  expect(saved.providers.venice.venice?.searchToolMode).toBe('selected')
  view.unmount();render(<MantineProvider><Controls/></MantineProvider>)
  expect((screen.getByRole('switch',{name:'Expose separate search engines'}) as HTMLInputElement).checked).toBe(true)
  expect((screen.getByRole('textbox',{name:'Search engine through Venice'}) as HTMLInputElement).value).toBe('Google')
  fireEvent.click(screen.getByRole('switch',{name:'Expose separate search engines'}))
  expect(saved.extension.webSearch.veniceSearchToolMode).toBe('selected')
})
