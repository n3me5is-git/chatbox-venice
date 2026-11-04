// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VeniceStudio } from './VeniceStudio'
import type { MediaRecord } from '@shared/providers/definitions/models/venice/media'
vi.mock('@/platform', () => ({ default: { exporter: { exportTextFile: vi.fn(), exportBlob: vi.fn() } } }))
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function setup(records: MediaRecord[] = []) {
  const service = { list: vi.fn().mockResolvedValue(records), subscribe: vi.fn(() => () => {}), catalog: vi.fn().mockResolvedValue([]), quote: vi.fn().mockResolvedValue({ quote: 1 }), start: vi.fn().mockResolvedValue(record), resume: vi.fn(), pause: vi.fn(), remove: vi.fn(), cleanup: vi.fn(), content: vi.fn(async (): Promise<string | null> => null), isActive: vi.fn(() => false) }
  return service
}
const record = { id: 'one', kind: 'video', model: 'video', prompt: 'Landscape', createdAt: 1, status: 'paused', queueId: 'q1', origin: 'https://api.venice.ai/api/v1', credentialId: 'hash' } satisfies MediaRecord
function show(service: ReturnType<typeof setup>, options = { audioEnabled: true, videoEnabled: true, musicEnabled: true }) { return render(<MantineProvider><VeniceStudio service={service} options={options} /></MantineProvider>) }
describe('Venice Studio simulated interactions', () => {
  it('never loads a remote catalog or generates anything on mount', async () => {
    const service = setup(); show(service); await screen.findByText('Nessuna generazione salvata.')
    expect(service.catalog).not.toHaveBeenCalled(); expect(service.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Carica modelli Venice' })); await waitFor(() => expect(service.catalog).toHaveBeenCalledTimes(1))
  })
  it('validates required input and sends the selected options only on explicit generation', async () => {
    const service = setup(); show(service)
    const button = screen.getByRole('button', { name: 'Genera con Venice' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('ID modello'), { target: { value: 'tts' } }); fireEvent.change(screen.getByLabelText('Testo da leggere'), { target: { value: 'Buongiorno' } })
    fireEvent.change(screen.getByLabelText('Parametri aggiuntivi JSON (opzionali)'), { target: { value: '{"speed":0.8}' } })
    fireEvent.click(button); await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ kind: 'speech', model: 'tts', prompt: 'Buongiorno', options: expect.objectContaining({ speed: 0.8 }) })))
  })
  it('shows invalid JSON errors without invoking the API and lets the user correct them', async () => {
    const service = setup(); show(service)
    fireEvent.change(screen.getByLabelText('ID modello'), { target: { value: 'tts' } }); fireEvent.change(screen.getByLabelText('Testo da leggere'), { target: { value: 'hello' } })
    fireEvent.change(screen.getByLabelText('Parametri aggiuntivi JSON (opzionali)'), { target: { value: '[]' } }); fireEvent.click(screen.getByRole('button', { name: 'Genera con Venice' }))
    expect((await screen.findByRole('alert')).textContent).toContain('JSON object'); expect(service.start).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Parametri aggiuntivi JSON (opzionali)'), { target: { value: '{}' } }); fireEvent.click(screen.getByRole('button', { name: 'Genera con Venice' })); await waitFor(() => expect(service.start).toHaveBeenCalledTimes(1))
  })
  it('keeps local history usable with modules disabled and prevents resume', async () => {
    const service = setup([record]); show(service, { audioEnabled: false, videoEnabled: false, musicEnabled: false })
    await screen.findByText('Landscape'); expect((screen.getByRole('button', { name: 'Riprendi lavoro esistente' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Elimina dal dispositivo' })); await waitFor(() => expect(service.remove).toHaveBeenCalledWith('one')); expect(service.cleanup).not.toHaveBeenCalled()
  })
  it('resumes the existing job and distinguishes remote cleanup from local deletion', async () => {
    const service = setup([record]); show(service); await screen.findByText('Landscape')
    fireEvent.click(screen.getByRole('button', { name: 'Riprendi lavoro esistente' })); await waitFor(() => expect(service.resume).toHaveBeenCalledWith('one')); expect(service.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Elimina copia su Venice' })); await waitFor(() => expect(service.cleanup).toHaveBeenCalledWith('one')); expect(service.remove).not.toHaveBeenCalled()
  })
  it('rejects nonlocal content URLs for embedded playback', async () => {
    const service = setup([{ ...record, status: 'ready', blobKey: 'blob' }]); service.content.mockResolvedValue('https://tracking.example/video.mp4'); show(service)
    await screen.findByText('Landscape'); expect(screen.queryByLabelText('Video generato')).toBeNull()
  })
})
