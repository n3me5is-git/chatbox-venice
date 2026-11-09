// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }))
import { SubscriptionSessionSearch } from './SubscriptionSessionSearch'
beforeEach(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches:false, addListener(){},removeListener(){},addEventListener(){},removeEventListener(){} }) }); vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} }); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('stores native search independently, including an explicit off override and inheritance', () => {
  const save=vi.fn(); render(<MantineProvider><SubscriptionSessionSearch settings={{}} onChange={save}/></MantineProvider>)
  fireEvent.click(screen.getByLabelText('ChatGPT native web search')); fireEvent.click(screen.getByRole('option',{name:'On'})); expect(save).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByLabelText('ChatGPT native web search')); fireEvent.click(screen.getByRole('option',{name:'Off'})); expect(save).toHaveBeenLastCalledWith(false)
})
