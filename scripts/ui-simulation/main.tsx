import '@mantine/core/styles.css'
import { Checkbox, MantineProvider } from '@mantine/core'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { VeniceStudio } from '../../src/renderer/components/venice/VeniceStudio'
import { VeniceMediaService, type MediaRecord } from '../../src/shared/providers/definitions/models/venice/media'
let records: MediaRecord[] = []; const blobs = new Map<string, string>()
const configuration = { apiKey: 'SIMULATED-NOT-A-REAL-KEY', options: { audioEnabled: true, videoEnabled: true, musicEnabled: true } }
const wav = new Uint8Array(2044); const header = new DataView(wav.buffer)
const ascii = (at: number, text: string) => [...text].forEach((letter, i) => { wav[at + i] = letter.charCodeAt(0) })
ascii(0, 'RIFF'); header.setUint32(4, wav.length - 8, true); ascii(8, 'WAVEfmt '); header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true); header.setUint32(24, 8000, true); header.setUint32(28, 16000, true); header.setUint16(32, 2, true); header.setUint16(34, 16, true); ascii(36, 'data'); header.setUint32(40, wav.length - 44, true)
const service = new VeniceMediaService({ read: async () => structuredClone(records), write: async value => { records = structuredClone(value) }, putBlob: async (id, value) => { blobs.set(id, value) }, getBlob: async id => blobs.get(id) || null, deleteBlob: async id => { blobs.delete(id) } }, () => configuration, async request => {
  (window as any).__simulationRequestCount = ((window as any).__simulationRequestCount || 0) + 1
  const path = new URL(request.url).pathname
  if (path.endsWith('/models')) return Response.json({ data: [{ id: 'tts-kokoro', type: 'tts', model_spec: { name: 'Kokoro', voices: ['if_sara', 'im_nicola'], default_voice: 'if_sara', supported_formats: ['mp3', 'wav'], default_format: 'mp3' } }] })
  if (path.endsWith('/audio/speech')) {
    (window as any).__simulationLastBody = JSON.parse(String(request.body))
    if (String(request.body).includes('SIMULATE_ERROR')) return new Response('', { status: 429 })
    return new Response(wav, { headers: { 'content-type': 'audio/wav' } })
  }
  throw new Error('Unexpected simulated request: ' + path)
})
function Simulation() {
  const [enabled, setEnabled] = useState(true)
  return <MantineProvider><div style={{ padding: 12, background: '#fff3bf' }}>Simulazione locale: nessuna API reale, nessun addebito.<Checkbox label="Modulo audio attivo (simulazione)" checked={enabled} onChange={e => { const value = e.currentTarget.checked; configuration.options.audioEnabled = value; setEnabled(value) }} /></div><VeniceStudio service={service} options={{ ...configuration.options, audioEnabled: enabled }} /></MantineProvider>
}
createRoot(document.getElementById('root')!).render(<Simulation />)
