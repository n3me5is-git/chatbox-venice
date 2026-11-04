import { Accordion, Alert, Badge, Button, Checkbox, Code, FileInput, Group, Loader, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Slider, Stack, Text, Textarea, TextInput, ThemeIcon, Title } from '@mantine/core'
import { IconMicrophone, IconMusic, IconPlayerPlay, IconRefresh, IconVideo, IconWaveSine } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { VeniceOptions } from '@shared/providers/definitions/models/venice/options'
import { mediaEnabled, type MediaKind, type MediaRecord, type MediaCatalogItem, type VeniceMediaService } from '@shared/providers/definitions/models/venice/media'
import { audioFormats, friendlyMediaError, mediaTypes, quoteLabel, readableName, supportedValues, voiceChoices } from '@shared/providers/definitions/models/venice/catalog'
import { parseExtraBody } from '@shared/models/utils/extra-body'
import platform from '@/platform'

type Service = Pick<VeniceMediaService, 'list' | 'subscribe' | 'catalog' | 'quote' | 'start' | 'resume' | 'pause' | 'remove' | 'cleanup' | 'content' | 'isActive'> & Partial<Pick<VeniceMediaService, 'cachedCatalog'>>
const names: Record<MediaKind, string> = { speech: 'Voce', transcription: 'Trascrivi', video: 'Video', music: 'Musica e suoni' }
const titles: Record<MediaKind, string> = { speech: 'Dai voce alle tue parole', transcription: 'Trasforma un audio in testo', video: 'Crea un video dalla tua idea', music: 'Crea la tua colonna sonora' }
const actions: Record<MediaKind, string> = { speech: 'Genera voce', transcription: 'Trascrivi file', video: 'Crea video', music: 'Crea musica' }
const icons = { speech: IconWaveSine, transcription: IconMicrophone, video: IconVideo, music: IconMusic }
const languages = [{ value: 'auto', label: 'Rileva automaticamente' }, { value: 'it', label: 'Italiano' }, { value: 'en', label: 'Inglese' }, { value: 'es', label: 'Spagnolo' }, { value: 'fr', label: 'Francese' }, { value: 'de', label: 'Tedesco' }, { value: 'pt', label: 'Portoghese' }, { value: 'ja', label: 'Giapponese' }, { value: 'zh', label: 'Cinese' }, { value: 'hi', label: 'Hindi' }]
const fullLanguages: Record<string, string> = { it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese', hi: 'Hindi' }
async function imageDataUrl(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Usa un’immagine PNG, JPEG o WebP fino a 10 MB')
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Impossibile leggere l’immagine')); reader.readAsDataURL(file) })
}
export function VeniceStudio({ service, options, openSettings }: { service: Service; options: VeniceOptions; openSettings?: () => void }) {
  const [kind, setKind] = useState<MediaKind>('speech')
  const [model, setModel] = useState(''); const [prompt, setPrompt] = useState(''); const [voice, setVoice] = useState('')
  const [format, setFormat] = useState('auto'); const [speed, setSpeed] = useState(1); const [language, setLanguage] = useState('auto')
  const [duration, setDuration] = useState('5s'); const [seconds, setSeconds] = useState<number | string>(30)
  const [aspect, setAspect] = useState(''); const [resolution, setResolution] = useState(''); const [audio, setAudio] = useState(false)
  const [lyrics, setLyrics] = useState(''); const [instrumental, setInstrumental] = useState(false)
  const [extra, setExtra] = useState(''); const [file, setFile] = useState<File | null>(null); const [image, setImage] = useState<File | null>(null)
  const [records, setRecords] = useState<MediaRecord[]>([]); const [catalog, setCatalog] = useState<MediaCatalogItem[]>([])
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [quote, setQuote] = useState(''); const [advanced, setAdvanced] = useState<string | null>(null)
  const enabled = mediaEnabled(kind, options)
  const compatible = catalog.filter(item => item.type === mediaTypes[kind])
  const selected = compatible.find(item => item.id === model)
  const voices = voiceChoices(selected); const formats = audioFormats(selected)
  const durations = supportedValues(selected, 'durations', 'duration', 'durationOptions').map(value => /^\d+$/.test(value) ? value + 's' : value)
  const ratios = supportedValues(selected, 'aspectRatios', 'aspect_ratios', 'aspect_ratio')
  const resolutions = supportedValues(selected, 'resolutions', 'resolution')
  const pickModel = (id: string, items = catalog) => {
    const item = items.find(item => item.id === id && item.type === mediaTypes[kind]); const choices = voiceChoices(item)
    setModel(id); setVoice(choices.some(voice => voice.value === item?.model_spec?.default_voice) ? item!.model_spec!.default_voice! : choices[0]?.value || '')
    setFormat('auto'); setSpeed(1); setAudio(false); setAspect(''); setResolution(''); setImage(null)
    const values = supportedValues(item, 'durations', 'duration', 'durationOptions'); setDuration(values[0] ? /^\d+$/.test(values[0]) ? values[0] + 's' : values[0] : '5s')
  }
  useEffect(() => {
    let live = true
    const refresh = () => { void service.list().then(items => { if (live) setRecords(items) }).catch(e => { if (live) setError(String(e)) }) }
    refresh(); const unsubscribe = service.subscribe(refresh)
    void service.cachedCatalog?.().then(items => { if (live) setCatalog(items) }).catch(() => {})
    return () => { live = false; unsubscribe() }
  }, [service])
  useEffect(() => { if (compatible.length && !compatible.some(item => item.id === model)) pickModel(compatible[0].id) }, [catalog, kind])
  useEffect(() => setQuote(''), [kind, model, prompt, voice, format, speed, language, duration, seconds, lyrics, instrumental, extra, aspect, resolution, audio, image])
  const run = async (work: () => Promise<unknown>) => { setError(''); setBusy(true); try { await work() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }
  const speechOptions = () => ({ voice: voice || undefined, response_format: format === 'auto' ? undefined : format, speed,
    ...(language !== 'auto' && !model.includes('kokoro') ? { language: /qwen|minimax/i.test(model) ? fullLanguages[language] : language } : {}) })
  const input = async (references = true) => ({ kind, model, prompt, file: file || undefined, options: {
    ...(kind === 'speech' ? speechOptions() : {}), ...(kind === 'transcription' && language !== 'auto' ? { language } : {}),
    ...(kind === 'video' ? { duration, ...(aspect ? { aspect_ratio: aspect } : {}), ...(resolution ? { resolution } : {}), ...(audio ? { audio } : {}), ...(references && image ? { image_url: await imageDataUrl(image) } : {}) } : {}),
    ...(kind === 'music' ? { duration_seconds: Number(seconds), force_instrumental: instrumental, ...(lyrics ? { lyrics_prompt: lyrics } : {}) } : {}),
    ...parseExtraBody(extra),
  } })
  const ready = enabled && !!model && (kind === 'transcription' ? !!file : !!prompt.trim())
  const KindIcon = icons[kind]
  return <Stack p={{ base: 'sm', sm: 'lg' }} maw={1000} mx="auto" style={{ width: '100%' }}>
    <Group justify="space-between" gap="sm"><Group gap="sm"><ThemeIcon size={44} radius="xl" variant="light"><KindIcon size={25} /></ThemeIcon><Stack gap={2}><Title order={2}>Crea con Venice</Title><Text size="sm" c="dimmed">Voce, video e musica. Tutto in un unico posto.</Text></Stack></Group>{openSettings && <Button variant="subtle" size="xs" onClick={openSettings}>Impostazioni</Button>}</Group>
    <SegmentedControl fullWidth aria-label="Tipo di contenuto" value={kind} data={Object.entries(names).map(([value, label]) => ({ value, label }))} onChange={value => { setKind(value as MediaKind); setModel(''); setExtra(''); setError('') }} />
    {!enabled && <Alert color="yellow" title="Questa funzione è disattivata">Abilitala nelle impostazioni Venice per iniziare. I contenuti già salvati restano qui.{openSettings && <Button mt="xs" size="xs" variant="light" onClick={openSettings}>Apri impostazioni</Button>}</Alert>}
    {error && <Alert color="red" role="alert" title="Non è andata a buon fine">{friendlyMediaError(error)}<Accordion variant="default"><Accordion.Item value="error"><Accordion.Control>Dettagli</Accordion.Control><Accordion.Panel><Code block>{error}</Code></Accordion.Panel></Accordion.Item></Accordion></Alert>}
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}><Stack gap="lg">
      <Title order={3}>{titles[kind]}</Title>
      <Group align="end" wrap="wrap"><Select label="Modello" placeholder={catalog.length ? 'Scegli un modello' : 'Carica i modelli disponibili'} searchable allowDeselect={false} value={model || null}
        data={[...compatible.map(item => ({ value: item.id, label: item.model_spec?.name || readableName(item.id) })), ...(!compatible.some(item => item.id === model) && model ? [{ value: model, label: readableName(model) }] : [])]} disabled={!compatible.length && !model} style={{ flex: 1, minWidth: 180 }} onChange={value => value && pickModel(value)} />
        <Button leftSection={<IconRefresh size={16} />} variant="default" disabled={options.enabled === false || busy} onClick={() => void run(async () => setCatalog(await service.catalog()))}>{catalog.length ? 'Aggiorna modelli' : 'Carica modelli'}</Button></Group>
      {selected?.model_spec?.description && <Text size="sm" c="dimmed">{selected.model_spec.description}</Text>}
      {kind === 'transcription' ? <FileInput label="Carica un audio o un video" description="Fino a 25 MB. Il file viene inviato a Venice solo quando premi Trascrivi." placeholder="Scegli un file dal dispositivo" accept="audio/*,video/*" value={file} onChange={setFile} clearable />
        : <Textarea label={kind === 'speech' ? 'Testo da leggere' : kind === 'video' ? 'Descrivi il tuo video' : 'Descrivi la musica o il suono'} placeholder={kind === 'speech' ? 'Scrivi o incolla il testo a cui vuoi dare voce…' : kind === 'video' ? 'Una passeggiata al mare, luce del tramonto, movimento lento…' : 'Un brano jazz rilassante con pianoforte e contrabbasso…'} value={prompt} onChange={e => setPrompt(e.currentTarget.value)} autosize minRows={4} maxRows={10} />}
      {kind === 'speech' && <>
        <SimpleGrid cols={{ base: 1, sm: 2 }}><Select label="Voce" placeholder={model ? 'Voce predefinita del modello' : 'Scegli prima un modello'} description={voices.length ? `${voices.length} voci disponibili per questo modello` : 'Se il catalogo non indica delle voci, viene usata quella predefinita.'} searchable clearable value={voice || null} data={[...voices, ...(!voices.some(item => item.value === voice) && voice ? [{ value: voice, label: 'Voce personalizzata' }] : [])]} disabled={!model || !voices.length} onChange={value => setVoice(value || '')} />
          <Select label="Formato audio" allowDeselect={false} value={format} data={[{ value: 'auto', label: selected?.model_spec?.default_format ? `Consigliato (${selected.model_spec.default_format.toUpperCase()})` : 'Consigliato dal modello' }, ...formats.map(value => ({ value, label: value.toUpperCase() }))]} onChange={value => setFormat(value || 'auto')} /></SimpleGrid>
        {!model.includes('kokoro') && <Select label="Lingua" value={language} allowDeselect={false} data={languages} onChange={value => setLanguage(value || 'auto')} />}
        <Stack gap={5}><Text size="sm" fw={500}>Velocità di lettura</Text><Slider aria-label="Velocità di lettura" value={speed} onChange={setSpeed} min={0.25} max={4} step={0.05} label={value => `${value.toFixed(2)}×`} marks={[{ value: 0.5, label: 'Più lenta' }, { value: 1, label: 'Normale' }, { value: 2, label: 'Più veloce' }]} mb="md" /></Stack>
        <Group><Button leftSection={<IconPlayerPlay size={15} />} variant="light" size="xs" disabled={!enabled || !model || busy} onClick={() => void run(async () => { await service.start({ kind: 'speech', model, prompt: 'Ciao! Questa è una breve prova della voce che hai scelto.', options: speechOptions() }) })}>Genera una breve prova</Button><Text size="xs" c="dimmed">La prova usa una breve generazione e può avere un costo.</Text></Group>
      </>}
      {kind === 'transcription' && <Select label="Lingua dell’audio" value={language} allowDeselect={false} data={languages} onChange={value => setLanguage(value || 'auto')} />}
      {kind === 'video' && <><SimpleGrid cols={{ base: 1, sm: 2 }}>{durations.length ? <Select label="Durata" allowDeselect={false} value={duration} data={durations.map(value => ({ value, label: /^\d+s$/.test(value) ? value.slice(0, -1) + ' secondi' : value }))} onChange={value => setDuration(value || durations[0])} /> : <NumberInput label="Durata (secondi)" description="Le durate accettate dipendono dal modello scelto." min={1} max={60} value={Number.parseInt(duration) || ''} onChange={value => setDuration(typeof value === 'number' ? value + 's' : '')} />}
        {!!ratios.length && <Select label="Inquadratura" clearable placeholder="Automatica" value={aspect || null} data={ratios.map(value => ({ value, label: value === '16:9' ? 'Orizzontale · 16:9' : value === '9:16' ? 'Verticale · 9:16' : value === '1:1' ? 'Quadrata · 1:1' : value }))} onChange={value => setAspect(value || '')} />}
        {!!resolutions.length && <Select label="Qualità video" clearable placeholder="Consigliata dal modello" value={resolution || null} data={resolutions} onChange={value => setResolution(value || '')} />}</SimpleGrid>
        <FileInput label="Immagine iniziale (facoltativa)" description="Per i modelli che animano immagini. PNG, JPEG o WebP fino a 10 MB." placeholder="Scegli un’immagine dal dispositivo" accept="image/png,image/jpeg,image/webp" value={image} onChange={setImage} clearable />
        {selected?.model_spec?.capabilities?.supportsAudio === true && <Checkbox label="Genera anche l’audio del video" checked={audio} onChange={e => setAudio(e.currentTarget.checked)} />}
      </>}
      {kind === 'music' && <><NumberInput label="Durata (secondi)" min={1} max={600} value={seconds} onChange={setSeconds} /><Checkbox label="Solo musica, senza voce" checked={instrumental} onChange={e => setInstrumental(e.currentTarget.checked)} />{!instrumental && <Textarea label="Testo della canzone (facoltativo)" placeholder="Scrivi il testo, oppure lascia che il modello lo crei…" value={lyrics} onChange={e => setLyrics(e.currentTarget.value)} autosize minRows={2} />}</>}
      <Accordion value={advanced} onChange={setAdvanced} variant="contained" radius="md"><Accordion.Item value="advanced"><Accordion.Control>Opzioni avanzate</Accordion.Control><Accordion.Panel><Stack gap="sm">
        <Text size="xs" c="dimmed">Per configurazioni personalizzate. Puoi usare tutte le funzioni principali senza modificare questi campi.</Text>
        <TextInput label="ID modello personalizzato" value={model} onChange={e => { setModel(e.currentTarget.value); setVoice(''); setFormat('auto') }} />
        {kind === 'speech' && <TextInput label="ID voce personalizzata" value={voice} onChange={e => setVoice(e.currentTarget.value)} />}
        <Textarea label="Parametri aggiuntivi JSON (opzionali)" description="Le opzioni aggiuntive prevalgono sui controlli qui sopra." value={extra} onChange={e => setExtra(e.currentTarget.value)} autosize minRows={2} />
      </Stack></Accordion.Panel></Accordion.Item></Accordion>
      {quote && <Alert color="blue" role="status">Costo stimato da Venice: <strong>{quote}</strong></Alert>}
      <Group justify="space-between"><Text size="xs" c="dimmed" maw={480}>Il contenuto viene inviato a Venice e salvato su questo dispositivo. La generazione può avere un costo.</Text><Group>{['video', 'music'].includes(kind) && <Button variant="default" disabled={!enabled || !model || busy || (kind === 'video' && !duration)} onClick={() => void run(async () => setQuote(quoteLabel(await service.quote(await input(false)))))}>Mostra costo</Button>}<Button disabled={!ready || busy || (kind === 'video' && !duration)} loading={busy} onClick={() => void run(async () => { await service.start(await input()) })}>{actions[kind]}</Button></Group></Group>
    </Stack></Paper>
    <Group justify="space-between" mt="sm"><Title order={3}>Le tue creazioni</Title><Badge variant="light">Salvate sul dispositivo</Badge></Group>
    {!records.length && <Paper withBorder p="xl" radius="lg"><Stack align="center" gap="xs"><ThemeIcon size={48} variant="light" radius="xl"><KindIcon /></ThemeIcon><Text fw={500}>La tua prima creazione ti aspetta</Text><Text size="sm" c="dimmed" ta="center">I risultati appariranno qui. Potrai riascoltarli, esportarli o eliminarli quando vuoi.</Text></Stack></Paper>}
    {records.map(record => <MediaResult key={record.id} record={record} modelName={catalog.find(model => model.id === record.model)?.model_spec?.name || readableName(record.model)} service={service} enabled={mediaEnabled(record.kind, options)} run={run} />)}
    <Text size="xs" c="dimmed">Audio, video e musica non usano E2EE. Interrompere l’attesa non annulla necessariamente il lavoro o il costo su Venice.</Text>
  </Stack>
}
function MediaResult({ record, modelName, service, enabled, run }: { record: MediaRecord; modelName: string; service: Service; enabled: boolean; run: (work: () => Promise<unknown>) => Promise<void> }) {
  const [content, setContent] = useState<string | null>(null); const [loadError, setLoadError] = useState('')
  useEffect(() => { let live = true; void service.content(record).then(value => { if (live) setContent(value) }).catch(() => { if (live) setLoadError('Impossibile leggere il contenuto locale') }); return () => { live = false } }, [record.blobKey, record.id, service])
  const safe = content && /^(data:audio\/[\w.+-]+;base64,|data:video\/mp4;base64,)/.test(content) ? content : null
  const statuses = { ready: 'Pronto', creating: 'Avvio in corso', queued: 'In elaborazione', paused: 'In pausa', error: 'Da controllare' }
  return <Paper withBorder radius="lg" p="md"><Stack gap="sm">
    <Group justify="space-between"><Stack gap={2}><Text fw={600}>{names[record.kind]} · {modelName}</Text><Text size="xs" c="dimmed">{new Date(record.createdAt).toLocaleString()}</Text></Stack><Badge color={record.status === 'ready' ? 'green' : record.status === 'error' ? 'orange' : 'blue'} variant="light">{statuses[record.status]}</Badge></Group>
    <Text lineClamp={3} style={{ overflowWrap: 'anywhere' }}>{record.prompt}</Text>
    {service.isActive(record.id) && <Group><Loader size="xs" /><Text size="sm">Stiamo preparando il tuo contenuto…</Text><Button size="xs" variant="default" onClick={() => void run(() => service.pause(record.id))}>Interrompi attesa</Button></Group>}
    {record.text && <Paper p="sm" bg="var(--mantine-color-default-hover)"><Text style={{ whiteSpace: 'pre-wrap' }}>{record.text}</Text></Paper>}
    {safe && (record.kind === 'video' ? <video aria-label="Video generato" controls src={safe} style={{ width: '100%', maxHeight: 500, borderRadius: 8 }} /> : <audio aria-label="Audio generato" controls src={safe} style={{ width: '100%' }} />)}
    {loadError && <Text c="red">{loadError}</Text>}
    {record.error && <Alert color="orange">{friendlyMediaError(record.error)}<Accordion variant="default"><Accordion.Item value="error"><Accordion.Control>Dettagli</Accordion.Control><Accordion.Panel><Code block>{record.error}</Code></Accordion.Panel></Accordion.Item></Accordion></Alert>}
    {record.queueId && !service.isActive(record.id) && record.status !== 'ready' && <Button disabled={!enabled} variant="light" onClick={() => void run(() => service.resume(record.id))}>Riprendi elaborazione</Button>}
    <Group justify="space-between"><Group>
      {(safe || record.text) && <Button size="xs" variant="default" onClick={() => void run(async () => {
        if (record.text) await platform.exporter.exportTextFile(`Venice-${record.id}.txt`, record.text)
        else if (safe) await platform.exporter.exportBlob(`Venice-${record.id}.${record.mime === 'video/mp4' ? 'mp4' : record.mime?.includes('wav') ? 'wav' : record.mime?.includes('flac') ? 'flac' : record.mime?.includes('ogg') ? 'ogg' : record.mime?.includes('opus') ? 'opus' : record.mime?.includes('aac') ? 'aac' : record.mime?.includes('pcm') ? 'pcm' : 'mp3'}`, await (await fetch(safe)).blob())
      })}>Esporta</Button>}
      {record.queueId && !record.remoteCleaned && <Button size="xs" variant="default" disabled={!enabled} onClick={() => void run(() => service.cleanup(record.id))}>Elimina copia su Venice</Button>}
    </Group><Button size="xs" color="red" variant="subtle" onClick={() => void run(() => service.remove(record.id))}>Elimina dal dispositivo</Button></Group>
    {!!record.queueId && <Text size="xs" c="dimmed">{record.remoteCleaned ? 'Copia remota eliminata, secondo la conferma di Venice.' : 'Eliminare dal dispositivo lascia la copia su Venice. Puoi eliminarla con il pulsante dedicato.'}</Text>}
  </Stack></Paper>
}
