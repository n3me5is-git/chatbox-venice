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
const models = [
  { id: 'tts-kokoro', type: 'tts', model_spec: { name: 'Kokoro', voices: ['if_sara', 'im_nicola'], default_voice: 'if_sara', supported_formats: ['mp3', 'wav'], default_format: 'mp3' } },
  { id: 'tts-other', type: 'tts', model_spec: { name: 'Altra voce', voices: ['Vivian'], default_voice: 'Vivian', supported_formats: ['wav'] } },
  { id: 'video', type: 'video', model_spec: { name: 'Video creativo', constraints: { duration: ['4s', '8s'], aspectRatios: ['16:9', '9:16'] } } },
]
const record = { id: 'one', kind: 'video', model: 'video', prompt: 'Landscape', createdAt: 1, status: 'paused', queueId: 'q1', origin: 'https://api.venice.ai/api/v1', credentialId: 'hash' } satisfies MediaRecord
function setup(records: MediaRecord[] = []) {
  return { list: vi.fn().mockResolvedValue(records), subscribe: vi.fn(() => () => {}), cachedCatalog: vi.fn().mockResolvedValue([]), catalog: vi.fn().mockResolvedValue(models), quote: vi.fn().mockResolvedValue({ quote: 0.75 }), start: vi.fn().mockResolvedValue(record), resume: vi.fn(), pause: vi.fn(), remove: vi.fn(), cleanup: vi.fn(), content: vi.fn(async (): Promise<string | null> => null), isActive: vi.fn(() => false) }
}
function show(service: ReturnType<typeof setup>, options = { audioEnabled: true, videoEnabled: true, musicEnabled: true }) { return render(<MantineProvider><VeniceStudio service={service} options={options} /></MantineProvider>) }
async function loadModels() { fireEvent.click(screen.getByRole('button', { name: 'Carica modelli' })); await waitFor(() => expect((screen.getByLabelText('Modello', { selector: 'input' }) as HTMLInputElement).value).toBe('Kokoro')) }
describe('Venice Studio simulated user journeys', () => {
  it('opens local history without network, and keeps technical settings collapsed', async () => {
    const service = setup(); show(service); await screen.findByText('La tua prima creazione ti aspetta')
    expect(service.catalog).not.toHaveBeenCalled(); expect(service.start).not.toHaveBeenCalled(); expect(service.cachedCatalog).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Opzioni avanzate' }).getAttribute('aria-expanded')).toBe('false')
    await loadModels(); expect(service.catalog).toHaveBeenCalledTimes(1)
  })
  it('offers the live model voices and generates without typing any IDs or JSON', async () => {
    const service = setup(); show(service); const generate = screen.getByRole('button', { name: 'Genera voce' }) as HTMLButtonElement
    expect(generate.disabled).toBe(true); await loadModels()
    expect((screen.getByLabelText('Voce da usare', { selector: 'input' }) as HTMLInputElement).value).toContain('Sara')
    fireEvent.click(screen.getByLabelText('Voce da usare', { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Nicola · Italiano' }))
    expect(service.start).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Testo da leggere'), { target: { value: 'Buongiorno' } }); fireEvent.click(generate)
    await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ kind: 'speech', model: 'tts-kokoro', prompt: 'Buongiorno', options: expect.objectContaining({ voice: 'im_nicola' }) })))
  })
  it('resets incompatible voice and format choices when choosing another model', async () => {
    const service = setup(); show(service); await loadModels()
    fireEvent.click(screen.getByLabelText('Modello', { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Altra voce' }))
    expect((screen.getByLabelText('Voce da usare', { selector: 'input' }) as HTMLInputElement).value).toContain('Vivian')
    fireEvent.click(screen.getByLabelText('Formato audio', { selector: 'input' })); expect(screen.queryByRole('option', { name: 'MP3' })).toBeNull(); expect(screen.getByRole('option', { name: 'WAV' })).toBeTruthy()
    expect(service.start).not.toHaveBeenCalled()
  })
  it('only generates a short voice preview after an explicit click', async () => {
    const service = setup(); show(service); await loadModels(); expect(service.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Genera una breve prova' })); await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ kind: 'speech', prompt: expect.stringContaining('breve prova'), options: expect.objectContaining({ voice: 'if_sara' }) })))
  })
  it('supports advanced parameters while explaining invalid JSON in plain language', async () => {
    const service = setup(); show(service); await loadModels()
    fireEvent.change(screen.getByLabelText('Testo da leggere'), { target: { value: 'hello' } }); fireEvent.click(screen.getByRole('button', { name: 'Opzioni avanzate' }))
    fireEvent.change(screen.getByLabelText('Parametri aggiuntivi JSON (opzionali)'), { target: { value: '[]' } }); fireEvent.click(screen.getByRole('button', { name: 'Genera voce' }))
    expect((await screen.findByRole('alert')).textContent).toContain('opzioni avanzate'); expect(service.start).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Parametri aggiuntivi JSON (opzionali)'), { target: { value: '{"speed":0.8}' } }); fireEvent.click(screen.getByRole('button', { name: 'Genera voce' })); await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ speed: 0.8 }) })))
  })
  it('shows video duration choices and a readable price before generation', async () => {
    const service = setup(); show(service); await loadModels(); fireEvent.click(screen.getByRole('radio', { name: 'Video' }))
    await waitFor(() => expect((screen.getByLabelText('Modello', { selector: 'input' }) as HTMLInputElement).value).toBe('Video creativo'))
    expect((screen.getByLabelText('Durata', { selector: 'input' }) as HTMLInputElement).value).toBe('4 secondi')
    fireEvent.click(screen.getByRole('button', { name: 'Mostra costo' })); expect((await screen.findByRole('status')).textContent).toContain('0,75'); expect(service.start).not.toHaveBeenCalled()
    expect(service.quote).toHaveBeenCalledWith(expect.objectContaining({ model: 'video', options: expect.objectContaining({ duration: '4s' }) }))
  })
  it('uploads a selected starting image for video without requiring a URL or JSON', async () => {
    const service = setup(); const view = show(service); await loadModels(); fireEvent.click(screen.getByRole('radio', { name: 'Video' }))
    await screen.findByLabelText('Descrivi il tuo video')
    fireEvent.change(screen.getByLabelText('Descrivi il tuo video'), { target: { value: 'Una passeggiata al mare' } })
    const upload = view.container.querySelector('input[type="file"]')!
    fireEvent.change(upload, { target: { files: [new File(['image'], 'start.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Crea video' }))
    await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video', options: expect.objectContaining({ image_url: expect.stringMatching(/^data:image\/png;base64,/) }) })))
  })
  it('keeps local history available when modules are disabled and blocks resume', async () => {
    const service = setup([record]); show(service, { audioEnabled: false, videoEnabled: false, musicEnabled: false })
    await screen.findByText('Landscape'); expect((screen.getByRole('button', { name: 'Riprendi elaborazione' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Elimina dal dispositivo' })); await waitFor(() => expect(service.remove).toHaveBeenCalledWith('one')); expect(service.cleanup).not.toHaveBeenCalled()
  })
  it('distinguishes resuming, local deletion and remote cleanup', async () => {
    const service = setup([record]); show(service); await screen.findByText('Landscape')
    fireEvent.click(screen.getByRole('button', { name: 'Riprendi elaborazione' })); await waitFor(() => expect(service.resume).toHaveBeenCalledWith('one')); expect(service.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Elimina copia su Venice' })); await waitFor(() => expect(service.cleanup).toHaveBeenCalledWith('one')); expect(service.remove).not.toHaveBeenCalled()
  })
  it('rejects remote content URLs for embedded playback', async () => {
    const service = setup([{ ...record, status: 'ready', blobKey: 'blob' }]); service.content.mockResolvedValue('https://tracking.example/video.mp4'); show(service)
    await screen.findByText('Landscape'); expect(screen.queryByLabelText('Video generato')).toBeNull()
  })
})
