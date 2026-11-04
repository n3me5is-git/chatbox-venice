import { Alert, Badge, Button, Checkbox, Code, FileInput, Group, Loader, NumberInput, Paper, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { VeniceOptions } from '@shared/providers/definitions/models/venice/options'
import { mediaEnabled, type MediaKind, type MediaRecord, type MediaCatalogItem, type VeniceMediaService } from '@shared/providers/definitions/models/venice/media'
import { parseExtraBody } from '@shared/models/utils/extra-body'
import platform from '@/platform'

type Service = Pick<VeniceMediaService, 'list' | 'subscribe' | 'catalog' | 'quote' | 'start' | 'resume' | 'pause' | 'remove' | 'cleanup' | 'content' | 'isActive'>
const names: Record<MediaKind, string> = { speech: 'Voce', transcription: 'Trascrizione', video: 'Video', music: 'Musica / effetti sonori' }
const types: Record<MediaKind, string> = { speech: 'tts', transcription: 'asr', video: 'video', music: 'music' }
export function VeniceStudio({ service, options, openSettings }: { service: Service; options: VeniceOptions; openSettings?: () => void }) {
  const [kind, setKind] = useState<MediaKind>('speech')
  const [model, setModel] = useState(''); const [prompt, setPrompt] = useState(''); const [voice, setVoice] = useState('af_sky')
  const [duration, setDuration] = useState('5s'); const [seconds, setSeconds] = useState<number | string>(30)
  const [lyrics, setLyrics] = useState(''); const [instrumental, setInstrumental] = useState(false)
  const [extra, setExtra] = useState(''); const [file, setFile] = useState<File | null>(null)
  const [records, setRecords] = useState<MediaRecord[]>([]); const [catalog, setCatalog] = useState<MediaCatalogItem[]>([])
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [quote, setQuote] = useState('')
  const enabled = mediaEnabled(kind, options)
  useEffect(() => {
    let live = true
    const refresh = () => { void service.list().then(items => { if (live) setRecords(items) }).catch(e => { if (live) setError(String(e)) }) }
    refresh(); const unsubscribe = service.subscribe(refresh)
    return () => { live = false; unsubscribe() }
  }, [service])
  const run = async (work: () => Promise<unknown>) => { setError(''); setBusy(true); try { await work() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }
  const input = () => ({ kind, model, prompt, file: file || undefined, options: {
    ...(kind === 'speech' ? { voice, response_format: 'mp3' } : {}), ...(kind === 'video' ? { duration } : {}),
    ...(kind === 'music' ? { duration_seconds: Number(seconds), force_instrumental: instrumental, ...(lyrics ? { lyrics_prompt: lyrics } : {}) } : {}),
    ...parseExtraBody(extra),
  } })
  const selected = catalog.find(item => item.id === model)
  return <Stack p="md" maw={1100} mx="auto" style={{ width: '100%', overflowY: 'auto' }}>
    <Group justify="space-between"><Title order={2}>Venice Studio</Title>{openSettings && <Button variant="subtle" onClick={openSettings}>Impostazioni Venice</Button>}</Group>
    <Text size="sm" c="dimmed">Generazioni e cronologia sul dispositivo. I contenuti scelti vengono inviati a Venice. Audio, video e musica non usano E2EE.</Text>
    {!enabled && <Alert color="yellow" title="Modulo disattivato">Abilita il supporto Venice e il modulo nelle impostazioni. La cronologia resta disponibile.</Alert>}
    {error && <Alert color="red" role="alert" title="Operazione non completata">{error}</Alert>}
    <Paper withBorder p="md"><Stack>
      <Select label="Tipo di contenuto" allowDeselect={false} value={kind} data={Object.entries(names).map(([value, label]) => ({ value, label }))}
        onChange={value => { setKind(value as MediaKind); setModel(''); setQuote('') }} />
      <Group align="end"><TextInput label="ID modello" value={model} onChange={e => { setModel(e.currentTarget.value); setQuote('') }} style={{ flex: 1 }} />
        <Button disabled={options.enabled === false || busy} onClick={() => void run(async () => setCatalog(await service.catalog()))}>Carica modelli Venice</Button></Group>
      {!!catalog.length && <Select label="Modelli compatibili" searchable clearable value={catalog.some(item => item.id === model) ? model : null}
        data={catalog.filter(item => item.type === types[kind]).map(item => ({ value: item.id, label: item.model_spec?.name || item.id }))} onChange={value => { if (value) { setModel(value); setQuote('') } }} />}
      {selected && <Text size="xs" c="dimmed">Opzioni e limiti dipendono dal modello selezionato. I parametri aggiuntivi permettono di usare le opzioni esposte dalle sue API.</Text>}
      {kind === 'transcription' ? <FileInput label="File audio o video (massimo 25 MB)" accept="audio/*,video/*" value={file} onChange={setFile} clearable />
        : <Textarea label={kind === 'speech' ? 'Testo da leggere' : 'Descrizione del contenuto'} value={prompt} onChange={e => setPrompt(e.currentTarget.value)} autosize minRows={3} />}
      {kind === 'speech' && <TextInput label="Voce / voice ID" value={voice} onChange={e => setVoice(e.currentTarget.value)} />}
      {kind === 'video' && <TextInput label="Durata video (es. 5s)" value={duration} onChange={e => { setDuration(e.currentTarget.value); setQuote('') }} />}
      {kind === 'music' && <><NumberInput label="Durata audio in secondi" min={1} max={600} value={seconds} onChange={setSeconds} /><Checkbox label="Solo strumentale" checked={instrumental} onChange={e => setInstrumental(e.currentTarget.checked)} /><Textarea label="Testo della canzone (opzionale)" value={lyrics} onChange={e => setLyrics(e.currentTarget.value)} /></>}
      <Textarea label="Parametri aggiuntivi JSON (opzionali)" description="Per esempio risoluzione, aspect_ratio, lingua, speed, image_url o video_url, se supportati dal modello." value={extra} onChange={e => { setExtra(e.currentTarget.value); setQuote('') }} autosize minRows={2} />
      <Group>{['video', 'music'].includes(kind) && <Button variant="default" disabled={!enabled || !model || busy} onClick={() => void run(async () => setQuote(JSON.stringify(await service.quote(input()))))}>Calcola preventivo</Button>}
        <Button disabled={!enabled || !model || busy || (kind === 'transcription' ? !file : !prompt.trim())} loading={busy} onClick={() => void run(async () => { await service.start(input()) })}>Genera con Venice</Button></Group>
      {quote && <Text role="status" size="sm">Preventivo Venice: {quote}</Text>}
      <Text size="xs" c="dimmed">Le richieste possono avere un costo. Un errore non ripete automaticamente una generazione a pagamento. Interrompere l'attesa non garantisce l'annullamento del costo sul server.</Text>
    </Stack></Paper>
    <Title order={3}>Cronologia locale</Title>
    {!records.length && <Text>Nessuna generazione salvata.</Text>}
    {records.map(record => <MediaResult key={record.id} record={record} service={service} enabled={mediaEnabled(record.kind, options)} run={run} />)}
  </Stack>
}
function MediaResult({ record, service, enabled, run }: { record: MediaRecord; service: Service; enabled: boolean; run: (work: () => Promise<unknown>) => Promise<void> }) {
  const [content, setContent] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  useEffect(() => { let live = true; void service.content(record).then(value => { if (live) setContent(value) }).catch(() => { if (live) setLoadError('Impossibile leggere il contenuto locale') }); return () => { live = false } }, [record.blobKey, record.id, service])
  const safe = content && /^(data:audio\/[\w.+-]+;base64,|data:video\/mp4;base64,)/.test(content) ? content : null
  return <Paper withBorder p="md"><Stack gap="xs">
    <Group justify="space-between"><Text fw={600}>{names[record.kind]} · {record.model}</Text><Badge>{record.status}</Badge></Group>
    <Text size="xs" c="dimmed">{new Date(record.createdAt).toLocaleString()}</Text><Text style={{ overflowWrap: 'anywhere' }}>{record.prompt}</Text>
    {service.isActive(record.id) && <Group><Loader size="xs" /><Text size="sm">Elaborazione in corso</Text><Button size="xs" variant="default" onClick={() => void run(() => service.pause(record.id))}>Interrompi attesa</Button></Group>}
    {record.text && <Code block style={{ whiteSpace: 'pre-wrap' }}>{record.text}</Code>}
    {safe && (record.kind === 'video' ? <video aria-label="Video generato" controls src={safe} style={{ width: '100%', maxHeight: 500 }} /> : <audio aria-label="Audio generato" controls src={safe} style={{ width: '100%' }} />)}
    {loadError && <Text c="red">{loadError}</Text>}
    {record.error && <Text size="sm" c="red">{record.error}</Text>}
    {record.queueId && !service.isActive(record.id) && record.status !== 'ready' && <Button disabled={!enabled} variant="default" onClick={() => void run(() => service.resume(record.id))}>Riprendi lavoro esistente</Button>}
    <Group>
      {(safe || record.text) && <Button size="xs" variant="default" onClick={() => void run(async () => {
        if (record.text) await platform.exporter.exportTextFile(`Venice-${record.id}.txt`, record.text)
        else if (safe) await platform.exporter.exportBlob(`Venice-${record.id}.${record.mime === 'video/mp4' ? 'mp4' : record.mime?.includes('wav') ? 'wav' : record.mime?.includes('flac') ? 'flac' : 'mp3'}`, await (await fetch(safe)).blob())
      })}>Esporta</Button>}
      {record.queueId && !record.remoteCleaned && <Button size="xs" variant="default" disabled={!enabled} onClick={() => void run(() => service.cleanup(record.id))}>Elimina copia su Venice</Button>}
      <Button size="xs" color="red" variant="subtle" onClick={() => void run(() => service.remove(record.id))}>Elimina dal dispositivo</Button>
    </Group>
    {!!record.queueId && <Text size="xs" c="dimmed">{record.remoteCleaned ? 'Venice ha confermato la pulizia del contenuto remoto.' : 'La cancellazione locale non elimina la copia remota; usa il pulsante dedicato se disponibile.'}</Text>}
  </Stack></Paper>
}
