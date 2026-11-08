// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
vi.mock('@/i18n/fork', () => ({ forkT: (value: string) => value }))
vi.mock('@/packages/collaboration/qr', () => ({ pairingFromFrame: vi.fn() }))
import { pairingFromFrame } from '@/packages/collaboration/qr'
import { PairingScanner } from './PairingScanner'
const stop = vi.fn(), getUserMedia = vi.fn(), onCode = vi.fn(), onClose = vi.fn()
function mount() { return render(<MantineProvider><PairingScanner onCode={onCode} onClose={onClose}/></MantineProvider>) }
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 2 })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
  vi.mocked(pairingFromFrame).mockReturnValue(undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('live pairing camera', () => {
  it('uses video only, decodes frames, stops capture, and returns the code without joining', async () => {
    vi.mocked(pairingFromFrame).mockReturnValue('CB1.test')
    mount()
    await waitFor(() => expect(onCode).toHaveBeenCalledWith('CB1.test'))
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) }))
    expect(stop).toHaveBeenCalled()
  })
  it('releases a camera permission request that finishes after the panel was closed', async () => {
    let grant!: (value: any) => void
    getUserMedia.mockReturnValue(new Promise(resolve => { grant = resolve }))
    const view = mount(); view.unmount()
    await act(async () => grant({ getTracks: () => [{ stop }] }))
    expect(stop).toHaveBeenCalled(); expect(onCode).not.toHaveBeenCalled()
  })
  it('explains permission denial and offers the separate image route', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    mount()
    expect(await screen.findByText(/Camera access was denied/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close scanner' })); expect(onClose).toHaveBeenCalled()
  })
  it('stops the stream on app lock', async () => {
    mount(); await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    await act(async () => {})
    act(() => window.dispatchEvent(new Event('chatbox:privacy-lock')))
    expect(stop).toHaveBeenCalled(); expect(onClose).toHaveBeenCalled()
  })
})
