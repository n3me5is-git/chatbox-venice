// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VeniceStudio } from './VeniceStudio'
import type { MediaRecord, MediaCatalogItem } from '@shared/providers/definitions/models/venice/media'
vi.mock('@/platform', () => ({ default: { exporter: { exportTextFile: vi.fn(), exportBlob: vi.fn() } } }))
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const models: MediaCatalogItem[] = [
  { id: 'tts-kokoro', type: 'tts', model_spec: { name: 'Kokoro', voices: ['if_sara', 'im_nicola'], default_voice: 'if_sara', supported_formats: ['mp3', 'wav'], default_format: 'mp3' } },
  { id: 'tts-other', type: 'tts', model_spec: { name: 'Altra voce', voices: ['Vivian'], default_voice: 'Vivian', supported_formats: ['wav'] } },
  { id: 'video', type: 'video', model_spec: { name: 'Video creativo', constraints: { model_type: 'image-to-video', duration: ['4s', '8s'], aspectRatios: ['16:9', '9:16'] } } },
]
const record = { id: 'one', kind: 'video', model: 'video', prompt: 'Landscape', createdAt: 1, status: 'paused', queueId: 'q1', origin: 'https://api.venice.ai/api/v1', credentialId: 'hash' } satisfies MediaRecord
function setup(records: MediaRecord[] = []) {
  return { list: vi.fn().mockResolvedValue(records), subscribe: vi.fn(() => () => {}), cachedCatalog: vi.fn().mockResolvedValue([]), catalog: vi.fn().mockResolvedValue(models), quote: vi.fn().mockResolvedValue({ quote: 0.75 }), start: vi.fn().mockResolvedValue(record), resume: vi.fn(), pause: vi.fn(), remove: vi.fn(), cleanup: vi.fn(), content: vi.fn(async (): Promise<string | null> => null), isActive: vi.fn(() => false) }
}
function show(service: ReturnType<typeof setup>, options = { audioEnabled: true, videoEnabled: true, musicEnabled: true }) { return render(<MantineProvider><VeniceStudio service={service} options={options} /></MantineProvider>) }
async function loadModels() { fireEvent.click(screen.getByRole('button', { name: "Load models" })); await waitFor(() => expect((screen.getByLabelText("Model", { selector: 'input' }) as HTMLInputElement).value).toBe('Kokoro')) }
describe('Venice Studio simulated user journeys', () => {
  it('opens local history without network, and keeps technical settings collapsed', async () => {
    const service = setup(); show(service); await screen.findByText("Your first creation is waiting")
    expect(service.catalog).not.toHaveBeenCalled(); expect(service.start).not.toHaveBeenCalled(); expect(service.cachedCatalog).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: "Advanced options" }).getAttribute('aria-expanded')).toBe('false')
    await loadModels(); expect(service.catalog).toHaveBeenCalledTimes(1)
  })
  it('offers the live model voices and generates without typing any IDs or JSON', async () => {
    const service = setup(); show(service); const generate = screen.getByRole('button', { name: "Generate speech" }) as HTMLButtonElement
    expect(generate.disabled).toBe(true); await loadModels()
    expect((screen.getByLabelText("Voice to use", { selector: 'input' }) as HTMLInputElement).value).toContain('Sara')
    fireEvent.click(screen.getByLabelText("Voice to use", { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Nicola · Italian' }))
    expect(service.start).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Text to read"), { target: { value: 'Buongiorno' } }); fireEvent.click(generate)
    await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ kind: 'speech', model: 'tts-kokoro', prompt: 'Buongiorno', options: expect.objectContaining({ voice: 'im_nicola' }) })))
  })
  it('resets incompatible voice and format choices when choosing another model', async () => {
    const service = setup(); show(service); await loadModels()
    fireEvent.click(screen.getByLabelText("Model", { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Altra voce' }))
    expect((screen.getByLabelText("Voice to use", { selector: 'input' }) as HTMLInputElement).value).toContain('Vivian')
    fireEvent.click(screen.getByLabelText("Audio format", { selector: 'input' })); expect(screen.queryByRole('option', { name: 'MP3' })).toBeNull(); expect(screen.getByRole('option', { name: 'WAV' })).toBeTruthy()
    expect(service.start).not.toHaveBeenCalled()
  })
  it('only generates a short voice preview after an explicit click', async () => {
    const service = setup(); show(service); await loadModels(); expect(service.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: "Generate a short preview" })); await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ kind: 'speech', prompt: expect.stringContaining('short preview'), options: expect.objectContaining({ voice: 'if_sara' }) })))
  })
  it('supports advanced parameters while explaining invalid JSON in plain language', async () => {
    const service = setup(); show(service); await loadModels()
    fireEvent.change(screen.getByLabelText("Text to read"), { target: { value: 'hello' } }); fireEvent.click(screen.getByRole('button', { name: "Advanced options" }))
    fireEvent.change(screen.getByLabelText("Extra parameters JSON (optional)"), { target: { value: '[]' } }); fireEvent.click(screen.getByRole('button', { name: "Generate speech" }))
    expect((await screen.findByRole('alert')).textContent).toContain('advanced parameters'); expect(service.start).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Extra parameters JSON (optional)"), { target: { value: '{"speed":0.8}' } }); fireEvent.click(screen.getByRole('button', { name: "Generate speech" })); await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ speed: 0.8 }) })))
  })
  it('shows video duration choices and a readable price before generation', async () => {
    const service = setup(); show(service); await loadModels(); fireEvent.click(screen.getByRole('radio', { name: 'Video' }))
    await waitFor(() => expect((screen.getByLabelText("Model", { selector: 'input' }) as HTMLInputElement).value).toBe('Video creativo'))
    expect((screen.getByLabelText("Duration", { selector: 'input' }) as HTMLInputElement).value).toBe('4 seconds')
    fireEvent.click(screen.getByRole('button', { name: "Show cost" })); expect((await screen.findByRole('status')).textContent).toContain('0.75'); expect(service.start).not.toHaveBeenCalled()
    expect(service.quote).toHaveBeenCalledWith(expect.objectContaining({ model: 'video', options: expect.objectContaining({ duration: '4s' }) }))
  })
  it('uploads a selected starting image for video without requiring a URL or JSON', async () => {
    const service = setup(); const view = show(service); await loadModels(); fireEvent.click(screen.getByRole('radio', { name: 'Video' }))
    await screen.findByLabelText('Describe your video')
    fireEvent.change(screen.getByLabelText('Describe your video'), { target: { value: 'Una passeggiata al mare' } })
    const upload = view.container.querySelector('input[type="file"]')!
    fireEvent.change(upload, { target: { files: [new File(['image'], 'start.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: "Create video" }))
    await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video', options: expect.objectContaining({ image_url: expect.stringMatching(/^data:image\/png;base64,/) }) })))
  })
  it('keeps local history available when modules are disabled and blocks resume', async () => {
    const service = setup([record]); show(service, { audioEnabled: false, videoEnabled: false, musicEnabled: false })
    await screen.findByText('Landscape'); expect((screen.getByRole('button', { name: "Resume processing" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: "Delete from device" })); await waitFor(() => expect(service.remove).toHaveBeenCalledWith('one')); expect(service.cleanup).not.toHaveBeenCalled()
  })
  it('distinguishes resuming, local deletion and remote cleanup', async () => {
    const service = setup([record]); show(service); await screen.findByText('Landscape')
    fireEvent.click(screen.getByRole('button', { name: "Resume processing" })); await waitFor(() => expect(service.resume).toHaveBeenCalledWith('one')); expect(service.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: "Delete copy on Venice" })); await waitFor(() => expect(service.cleanup).toHaveBeenCalledWith('one')); expect(service.remove).not.toHaveBeenCalled()
  })
  it('rejects remote content URLs for embedded playback', async () => {
    const service = setup([{ ...record, status: 'ready', blobKey: 'blob' }]); service.content.mockResolvedValue('https://tracking.example/video.mp4'); show(service)
    await screen.findByText('Landscape'); expect(service.content).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'Open preview'}));await waitFor(()=>expect(service.content).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText("Generated video")).toBeNull()
  })
})

it('sends only supported music options and resets duration when the model changes', async () => {
  const service = setup(); service.catalog.mockResolvedValue([...models, { id: 'ace', type: 'music', model_spec: { name: 'ACE', min_duration: 60, max_duration: 210, default_duration: 60, duration_options: [60, 90], supports_lyrics: true, supports_force_instrumental: false } }, { id: 'eleven', type: 'music', model_spec: { name: 'Eleven', min_duration: 3, max_duration: 600, default_duration: 60, supports_lyrics: false, supports_force_instrumental: true } }])
  show(service); await loadModels(); fireEvent.click(screen.getByRole('radio', { name: "Music" }))
  expect(await screen.findByText("Only options declared by this model are shown. Settings reset when you change models.")).toBeTruthy()
  expect(screen.queryByLabelText("Instrumental only")).toBeNull()
  fireEvent.change(screen.getByLabelText("Describe the music or sound"), { target: { value: 'Una lunga melodia al pianoforte' } }); fireEvent.click(screen.getByRole('button', { name: "Create music" }))
  await waitFor(() => expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ model: 'ace', options: { duration_seconds: 60 } })))
  fireEvent.click(screen.getByLabelText("Model", { selector: 'input' })); fireEvent.click(screen.getByRole('option', { name: 'Eleven' }))
  expect(screen.queryByLabelText("Lyrics (optional)")).toBeNull(); expect(screen.getByLabelText("Instrumental only")).toBeTruthy()
})
it('does not show references for a text-only video model', async () => {
  const service = setup(); service.catalog.mockResolvedValue([{ id: 'video-text', type: 'video', model_spec: { name: 'Solo testo', constraints: { model_type: 'text-to-video', durations: ['5s'] } } }] as typeof models)
  show(service); fireEvent.click(screen.getByRole('radio', { name: 'Video' })); fireEvent.click(screen.getByRole('button', { name: "Load models" })); await waitFor(() => expect((screen.getByLabelText("Model", { selector: 'input' }) as HTMLInputElement).value).toBe('Solo testo'))
  expect(screen.queryByLabelText("Start image")).toBeNull(); expect(screen.queryByLabelText("Reference images")).toBeNull()
})

it('separates music and sound effects and sends a sound-effects job with only supported parameters', async () => {
  const service = setup(); service.catalog.mockResolvedValue([...models,
    { id:'song',type:'music',model_spec:{name:'Song model',supports_lyrics:true}},
    { id:'elevenlabs-sound-effects-v2',type:'music',model_spec:{name:'Effects model',min_duration:1,max_duration:22,default_duration:7,supports_loop:true}},
  ])
  show(service); await loadModels(); fireEvent.click(screen.getByRole('radio',{name:'Music'}))
  await waitFor(()=>expect((screen.getByLabelText('Model',{selector:'input'}) as HTMLInputElement).value).toBe('Song model'))
  fireEvent.click(screen.getByLabelText('Model',{selector:'input'})); expect(screen.queryByRole('option',{name:'Effects model'})).toBeNull()
  fireEvent.keyDown(screen.getByLabelText('Model',{selector:'input'}),{key:'Escape'})
  fireEvent.click(screen.getByRole('radio',{name:'Sound effects'}))
  await waitFor(()=>expect((screen.getByLabelText('Model',{selector:'input'}) as HTMLInputElement).value).toBe('Effects model'))
  expect(screen.queryByLabelText('Lyrics (optional)')).toBeNull()
  fireEvent.click(screen.getByLabelText('Create a seamless loop'))
  fireEvent.change(screen.getByLabelText('Describe the sound effect'),{target:{value:'Gentle rain on a window'}})
  fireEvent.click(screen.getByRole('button',{name:'Create sound effects'}))
  await waitFor(()=>expect(service.start).toHaveBeenCalledWith(expect.objectContaining({kind:'sound-effects',model:'elevenlabs-sound-effects-v2',options:{duration_seconds:7,loop:true}})))
})

it('does not load a large history into media memory and closes the previous preview', async () => {
  const records=Array.from({length:60},(_,index)=>({...record,id:String(index),blobKey:'blob-'+index,status:'ready' as const}))
  const service=setup(records);service.content.mockResolvedValue('data:video/mp4;base64,YQ==');show(service)
  await screen.findAllByRole('button',{name:'Open preview'});expect(service.content).not.toHaveBeenCalled();expect(screen.getAllByRole('button',{name:'Open preview'})).toHaveLength(20)
  fireEvent.click(screen.getAllByRole('button',{name:'Open preview'})[0]);await screen.findByLabelText('Generated video')
  fireEvent.click(screen.getAllByRole('button',{name:'Open preview'})[0]);await waitFor(()=>expect(service.content).toHaveBeenCalledTimes(2))
  expect(screen.getAllByLabelText('Generated video')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'Close preview'}));await waitFor(()=>expect(screen.queryByLabelText('Generated video')).toBeNull())
})
