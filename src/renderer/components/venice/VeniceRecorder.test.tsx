// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VeniceRecorder } from './VeniceRecorder'
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('explains a device permission refusal instead of exposing only Permission denied',async()=>{
  const onRecorded=vi.fn()
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(async()=>{throw new DOMException('Permission denied','NotAllowedError')})}})
  vi.stubGlobal('MediaRecorder',class {})
  render(<MantineProvider><VeniceRecorder onRecorded={onRecorded}/></MantineProvider>)
  fireEvent.click(screen.getByRole('button',{name:'Record from microphone'}))
  expect(await screen.findByText('Microphone access was denied. Check the app or browser microphone permission and the device microphone privacy switch, then try again.')).toBeTruthy()
  expect(onRecorded).not.toHaveBeenCalled()
})
it('records locally, stops the microphone and waits for a separate transcription action', async () => {
  const stop = vi.fn(); const onRecorded = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } })
  class Recorder {
    static isTypeSupported() { return true }; state = 'inactive'; mimeType = 'audio/webm'; ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void
    start() { this.state = 'recording' }; stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['recorded'], { type: 'audio/webm' }) }); this.onstop?.() }
  }
  vi.stubGlobal('MediaRecorder', Recorder)
  render(<MantineProvider><VeniceRecorder onRecorded={onRecorded} /></MantineProvider>)
  fireEvent.click(screen.getByRole('button', { name: "Record from microphone" }))
  fireEvent.click(await screen.findByRole('button', { name: "Stop recording" }))
  await waitFor(() => expect(onRecorded).toHaveBeenCalledOnce()); expect(onRecorded.mock.calls[0][0]).toBeInstanceOf(File); expect(stop).toHaveBeenCalledOnce()
})
