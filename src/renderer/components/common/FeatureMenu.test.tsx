// @vitest-environment jsdom
import { Button, MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useOverlayManager } from '@/components/layout/Overlay'
import { closeTopSurface } from '@/packages/overlay-back'
import { FeatureMenu } from './FeatureMenu'

Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) })
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
afterEach(cleanup)

function Fixture({ closeParent, changed }: { closeParent: () => void; changed: (file: File) => void }) {
  useOverlayManager(true, closeParent)
  return <FeatureMenu><FeatureMenu.Target><Button>Document actions</Button></FeatureMenu.Target><FeatureMenu.Dropdown><FeatureMenu.Item component="label">Replace source<input data-testid="replacement-input" hidden type="file" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) changed(file) }}/></FeatureMenu.Item></FeatureMenu.Dropdown></FeatureMenu>
}

it('closes the child action menu before its parent on native back', async () => {
  const closeParent = vi.fn()
  render(<MantineProvider><Fixture closeParent={closeParent} changed={vi.fn()}/></MantineProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Document actions' })); await screen.findByRole('menuitem')
  act(() => { expect(closeTopSurface()).toBe(true) })
  await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull())
  expect(closeParent).not.toHaveBeenCalled()
  act(() => { expect(closeTopSurface()).toBe(true) }); expect(closeParent).toHaveBeenCalledOnce()
})

it('retains the file input handler after its menu closes for the system picker', async () => {
  const changed = vi.fn()
  render(<MantineProvider><Fixture closeParent={vi.fn()} changed={changed}/></MantineProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Document actions' })); fireEvent.click(await screen.findByRole('menuitem', { name: 'Replace source' }))
  await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull())
  const file = new File(['updated'], 'updated.md', { type: 'text/markdown' })
  fireEvent.change(screen.getByTestId('replacement-input'), { target: { files: [file] } })
  expect(changed).toHaveBeenCalledWith(file)
})
