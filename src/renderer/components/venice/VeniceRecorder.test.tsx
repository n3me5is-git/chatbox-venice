// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VeniceRecorder } from './VeniceRecorder'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('records locally, stops the microphone and waits for a separate transcription action', async () => {
  const stop = vi.fn(); const onRecorded = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } })
  class Recorder {
    static isTypeSupported() { return true }; state = 'inactive'; mimeType = 'audio/webm'; ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void
    start() { this.state = 'recording' }; stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['recorded'], { type: 'audio/webm' }) }); this.onstop?.() }
  }
  vi.stubGlobal('MediaRecorder', Recorder)
  render(<MantineProvider><VeniceRecorder onRecorded={onRecorded} /></MantineProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Registra dal microfono' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Termina registrazione' }))
  await waitFor(() => expect(onRecorded).toHaveBeenCalledOnce()); expect(onRecorded.mock.calls[0][0]).toBeInstanceOf(File); expect(stop).toHaveBeenCalledOnce()
})
