// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { UserQuestionForm } from './UserQuestion'
import { GenerationFailureContent } from '@/components/venice/GenerationFailure'
Object.defineProperty(window,'matchMedia',{writable:true,value:()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()})})
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('accepts multiple choices plus custom text only after explicit submission',()=>{
  const submit=vi.fn(),cancel=vi.fn()
  render(<MantineProvider><UserQuestionForm input={{questions:[{question:'Choose the deliverables',options:['PDF','HTML','Markdown'],multiple:true}]}} onSubmit={submit} onCancel={cancel}/></MantineProvider>)
  expect((screen.getByRole('button',{name:'Send answers'}) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox',{name:'PDF'}));fireEvent.click(screen.getByRole('checkbox',{name:'HTML'}))
  fireEvent.change(screen.getByLabelText('Your answer'),{target:{value:'Use Italian'}})
  expect(submit).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Send answers'}))
  expect(submit).toHaveBeenCalledWith({answers:[{selected:['PDF','HTML'],text:'Use Italian'}]});expect(cancel).not.toHaveBeenCalled()
})
it('allows a custom-only reply and explicit cancellation',()=>{
  const submit=vi.fn(),cancel=vi.fn()
  render(<MantineProvider><UserQuestionForm input={{questions:[{question:'What should I change?'}]}} onSubmit={submit} onCancel={cancel}/></MantineProvider>)
  fireEvent.change(screen.getByLabelText('Your answer'),{target:{value:'Make the image brighter'}})
  expect((screen.getByRole('button',{name:'Send answers'}) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(cancel).toHaveBeenCalledOnce();expect(submit).not.toHaveBeenCalled()
})
it('shows the failed model and reason before offering retry or skip',()=>{
  const retry=vi.fn(),skip=vi.fn()
  render(<MantineProvider><GenerationFailureContent failure={{id:'failed',kind:'Image',model:'test-model',error:'HTTP 400: unsupported size'}} onRetry={retry} onSkip={skip}/></MantineProvider>)
  expect(screen.getByText('HTTP 400: unsupported size')).toBeTruthy();expect(screen.getByText('Image · test-model')).toBeTruthy()
  expect(retry).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Skip generation'}));expect(skip).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled()
})

