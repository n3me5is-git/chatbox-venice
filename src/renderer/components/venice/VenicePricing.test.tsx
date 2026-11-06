// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { translationResources } from '@chatbox/i18n'
import { VenicePricing } from './VenicePricing'
beforeEach(async()=>{await i18n.use(initReactI18next).init({resources:translationResources,lng:'en',fallbackLng:'en',interpolation:{escapeValue:false}})})
afterEach(()=>cleanup())
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
Element.prototype.scrollIntoView=vi.fn()
it('shows precise token rates prominently and switches to Italian',async()=>{
 render(<MantineProvider><VenicePricing model={{id:'text',type:'text',model_spec:{pricing:{input:{usd:0.05,diem:0.05},output:{usd:0.13}}}}} onQuote={vi.fn()}/></MantineProvider>)
 expect(screen.getByText('Input / 1M tokens')).toBeTruthy();expect(screen.getByText('0.05 USD')).toBeTruthy();expect(screen.getByText(/0.00000005 USD/)).toBeTruthy()
 await act(async()=>{await i18n.changeLanguage('it-IT')})
 expect(screen.getByText('0,05 USD')).toBeTruthy();expect(screen.getByLabelText('Prezzi del modello')).toBeTruthy()
})
it('requests a quote only on click and clears it when the selected settings change',async()=>{
 const quote=vi.fn().mockResolvedValue({quote:0.1})
 render(<MantineProvider><VenicePricing model={{id:'video',type:'video',model_spec:{constraints:{durations:['5s','10s'],resolutions:['720p','480p'],audio_configurable:true}}}} onQuote={quote}/></MantineProvider>)
 expect(quote).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Get current price estimate'}))
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('0.1 USD'))
 expect(screen.getByRole('status').textContent).toContain('0.02 USD')
 expect(quote).toHaveBeenCalledWith(expect.objectContaining({model:'video',options:{duration:'5s',resolution:'480p',audio:false}}))
 fireEvent.click(screen.getByLabelText('Include generated audio'));expect(screen.queryByRole('status')).toBeNull()
})
it('withholds missing rates and never turns a malformed quote into a price',async()=>{
 render(<MantineProvider><VenicePricing model={{id:'video',type:'video',model_spec:{constraints:{durations:['5s']}}}} onQuote={vi.fn().mockResolvedValue({quote:-1})}/></MantineProvider>)
 expect(screen.getByText(/Video pricing depends/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Get current price estimate'}))
 await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());expect(screen.queryByRole('status')).toBeNull()
})
