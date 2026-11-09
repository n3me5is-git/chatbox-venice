// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}))
import { ContextTokenBudgetField } from './ContextTokenBudgetField'
Object.defineProperty(window, 'matchMedia', {writable:true,value:vi.fn(()=>({matches:false,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
afterEach(()=>cleanup())
it('applies an explicit token budget, supports clearing and prevents Enter reaching the composer',()=>{
  const save=vi.fn(), outer=vi.fn();render(<MantineProvider><div onKeyDown={outer}><ContextTokenBudgetField label="Budget" value={200000} onApply={save}/></div></MantineProvider>)
  fireEvent.change(screen.getByLabelText('Budget'),{target:{value:'150000'}});fireEvent.keyDown(screen.getByLabelText('Budget'),{key:'Enter'});expect(save).toHaveBeenLastCalledWith(150000);expect(outer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Use default'}));expect(save).toHaveBeenLastCalledWith(undefined)
})
