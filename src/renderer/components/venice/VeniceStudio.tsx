import { ProtectedPreviewGate } from '@/components/security/ProtectedPreviewGate'
import { VeniceModelSelect } from './VeniceModelSelect'
import { CreationUnlock } from '@/components/security/CreationUnlock'
import { localText } from '@/packages/local-text'
import { LibraryFileInput as FileInput } from '@/components/local-library/LibraryFileInput'
import { useTranslation } from 'react-i18next'
import {GenerationFailureReason} from './GenerationFailureReason'
import {VeniceModelCost} from './VeniceModelCost'
import { forkT as ft } from '@/i18n/fork'
import { VeniceModelBadges } from './VeniceModelBadges'
import { VeniceModelInfo } from './VeniceModelInfo'
import { VeniceRecorder } from './VeniceRecorder'
import { VeniceVoiceCloning, type VoiceService } from './VeniceVoiceCloning'
import { mediaCategory, supportsMediaKind, musicDuration, musicOptions, videoInputs } from '@shared/providers/definitions/models/venice/media-capabilities'
import { Accordion, Alert, Badge, Button, Checkbox, Code, Group, Loader, NumberInput, Paper, SegmentedControl, Select, ScrollArea, SimpleGrid, Slider, Stack, Text, Textarea, TextInput, ThemeIcon, Title } from '@mantine/core'
import { IconMicrophone, IconMusic, IconPlayerPlay, IconRefresh, IconVideo, IconWaveSine } from '@tabler/icons-react'
import { useEffect,useMemo,useRef, useState,useSyncExternalStore } from 'react'
import { voiceFileDuration,validateVoiceDuration } from '@/packages/voice-file'
import { installedVaultFor } from '@/packages/vault/runtime'
import { lockedMediaRecord } from '@/packages/vault/media-records'
import { ScopeUnlock } from '@/components/security/ScopeUnlock'
import type { VeniceOptions } from '@shared/providers/definitions/models/venice/options'
import { mediaEnabled, type MediaKind, type MediaRecord, type MediaCatalogItem, type VeniceMediaService } from '@shared/providers/definitions/models/venice/media'
import { audioFormats, friendlyMediaError, mediaTypes, quoteLabel, readableName, supportedValues, voiceChoices } from '@shared/providers/definitions/models/venice/catalog'
import { parseExtraBody } from '@shared/models/utils/extra-body'
import { privacyAllowed } from '@shared/providers/definitions/models/venice/privacy'
import platform from '@/platform'

type Service = Pick<VeniceMediaService, 'list' | 'subscribe' | 'catalog' | 'quote' | 'start' | 'resume' | 'pause' | 'remove' | 'cleanup' | 'content' | 'isActive'> & Partial<Pick<VeniceMediaService, 'cachedCatalog'>> & VoiceService
const noSubscribe=()=>()=>{}
const zero=()=>0
const names: Record<MediaKind, string> = { speech: "Voice", transcription: "Transcribe", video: 'Video', music: "Music", "sound-effects": "Sound effects", "voice-conversion": "Voice conversion" }
const titles: Record<MediaKind, string> = { speech: "Give your words a voice", transcription: 'Turn audio into text', video: "Turn your idea into a video", music: "Create music", "sound-effects": "Create sound effects", "voice-conversion": "Convert a recording" }
const actions: Record<MediaKind, string> = { speech: "Generate speech", transcription: "Transcribe file", video: "Create video", music: "Create music", "sound-effects": "Create sound effects", "voice-conversion": "Convert a recording" }
const icons = { speech: IconWaveSine, transcription: IconMicrophone, video: IconVideo, music: IconMusic, "sound-effects": IconWaveSine, "voice-conversion": IconMicrophone }
const languages = [{ value: 'auto', label: "Detect automatically" }, { value: 'it', label: "Italian" }, { value: 'en', label: "English" }, { value: 'es', label: "Spanish" }, { value: 'fr', label: "French" }, { value: 'de', label: "German" }, { value: 'pt', label: "Portuguese" }, { value: 'ja', label: "Japanese" }, { value: 'zh', label: "Chinese" }, { value: 'hi', label: 'Hindi' }]
const fullLanguages: Record<string, string> = { it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ja: 'Japanese', zh: 'Chinese', hi: 'Hindi' }
async function mediaFileDataUrl(file: File, kind: 'video' | 'audio') {
  if (!(kind === 'video' ? ['video/mp4', 'video/quicktime', 'video/webm'] : ['audio/mpeg', 'audio/wav', 'audio/x-wav']).includes(file.type) || file.size > (kind === 'video' ? 50 : 15) * 1024 * 1024) throw new Error(ft("Unsupported reference format or size. Check the model details."))
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(ft("Unable to read the file"))); reader.readAsDataURL(file) })
}
async function imageDataUrl(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error(ft("Use a PNG, JPEG or WebP image up to 10 MB"))
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(ft("Unable to read the image"))); reader.readAsDataURL(file) })
}
export function VeniceStudio({ service, options, openSettings, initialKind, hideTabs }: { service: Service; options: VeniceOptions; openSettings?: () => void; initialKind?: MediaKind; hideTabs?: boolean }) {
  const {i18n} = useTranslation()
  const vault=installedVaultFor(platform);const privacyRevision=useSyncExternalStore(vault?.keys.subscribe||noSubscribe,vault?.keys.snapshot||zero,zero)
  const [saveProtected,setSaveProtected]=useState(false);const [librarySection,setLibrarySection]=useState('public')
  const [kind, setKind] = useState<MediaKind>(() => initialKind || (options.audioEnabled ? 'speech' : options.videoEnabled ? 'video' : options.musicEnabled ? 'music' : 'speech'))
  const [model, setModel] = useState(''); const [prompt, setPrompt] = useState(''); const [voice, setVoice] = useState('')
  const [format, setFormat] = useState('auto'); const [speed, setSpeed] = useState(1); const [language, setLanguage] = useState('auto')
  const [duration, setDuration] = useState('5s'); const [seconds, setSeconds] = useState<number | string>(30)
  const [aspect, setAspect] = useState(''); const [resolution, setResolution] = useState(''); const [audio, setAudio] = useState(false)
  const [endImage, setEndImage] = useState<File | null>(null); const [referenceImages, setReferenceImages] = useState<File[]>([]); const [sourceVideo, setSourceVideo] = useState<File | null>(null); const [referenceVideos, setReferenceVideos] = useState<File[]>([]); const [referenceAudio, setReferenceAudio] = useState<File[]>([]); const [audioFile, setAudioFile] = useState<File | null>(null)
  const [loop, setLoop] = useState(false); const [optimizer, setOptimizer] = useState(false)
  const [lyrics, setLyrics] = useState(''); const [instrumental, setInstrumental] = useState(false)
  const [extra, setExtra] = useState(''); const [file, setFile] = useState<File | null>(null); const [image, setImage] = useState<File | null>(null)
  const [openRecordId, setOpenRecordId] = useState<string|null>(null); const [visibleRecords, setVisibleRecords] = useState(20)
  const [records, setRecords] = useState<MediaRecord[]>([]); const [catalog, setCatalog] = useState<MediaCatalogItem[]>([])
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [quote, setQuote] = useState(''); const [advanced, setAdvanced] = useState<string | null>(null)
  const operation=useRef<AbortController|null>(null)
  useEffect(()=>{const stop=()=>operation.current?.abort();window.addEventListener('chatbox:privacy-lock',stop);return()=>window.removeEventListener('chatbox:privacy-lock',stop)},[])
  const enabled = mediaEnabled(kind, options)
  const compatible = catalog.filter(item => supportsMediaKind(item,kind) && privacyAllowed(item.model_spec, options.privacyFilter) && (options.showOtherModels || options.mediaModelIds === undefined || options.mediaModelIds.includes(item.id)) && (kind === 'voice-conversion' ? item.model_spec?.voice_changer === true : item.model_spec?.voice_changer !== true))
  const selected = compatible.find(item => item.id === model)
  const videoSupport = videoInputs(selected); const music = musicDuration(selected); const spec = selected?.model_spec
  const voices = voiceChoices(selected, ft); const formats = audioFormats(selected)
  const durations = supportedValues(selected, 'durations', 'duration', 'durationOptions').map(value => /^\d+$/.test(value) ? value + 's' : value)
  const ratios = supportedValues(selected, 'aspectRatios', 'aspect_ratios', 'aspect_ratio')
  const resolutions = supportedValues(selected, 'resolutions', 'resolution')
  const pickModel = (id: string, items = catalog) => {
    const item = items.find(item => item.id === id && supportsMediaKind(item,kind)); const choices = voiceChoices(item, ft)
    setModel(id); setVoice(choices.some(voice => voice.value === item?.model_spec?.default_voice) ? item!.model_spec!.default_voice! : choices[0]?.value || '')
    setFormat('auto'); setSpeed(1); setAudio(false); setAspect(''); setResolution(''); setImage(null); setEndImage(null); setReferenceImages([]); setSourceVideo(null); setReferenceVideos([]); setReferenceAudio([]); setAudioFile(null); setInstrumental(false); setLyrics(''); setLoop(false); setOptimizer(false); setSeconds(musicDuration(item).default ?? musicDuration(item).choices[0] ?? musicDuration(item).min)
    const values = supportedValues(item, 'durations', 'duration', 'durationOptions'); setDuration(values[0] ? /^\d+$/.test(values[0]) ? values[0] + 's' : values[0] : '5s')
  }
  useEffect(() => {
    let live = true
    const refresh = () => { void service.list().then(items => { if (live) setRecords(items) }).catch(e => { if (live) setError(String(e)) }) }
    refresh(); const unsubscribe = service.subscribe(refresh)
    void service.cachedCatalog?.().then(items => { if (live) setCatalog(items) }).catch(() => {})
    return () => { live = false; unsubscribe() }
  }, [service,privacyRevision])
  useEffect(() => { if (!compatible.some(item => item.id === model)) { if (compatible.length) pickModel(compatible[0].id); else if (model) setModel('') } }, [catalog, kind, options.privacyFilter, options.showOtherModels, options.mediaModelIds])
  useEffect(() => setQuote(''), [kind, model, prompt, voice, format, speed, language, duration, seconds, lyrics, instrumental, extra, aspect, resolution, audio, image, endImage, referenceImages, sourceVideo, referenceVideos, referenceAudio, audioFile, loop, optimizer])
  const run = async (work: () => Promise<unknown>) => { operation.current=new AbortController();setError(''); setBusy(true); try { await work() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }
  const speechOptions = () => selected?.type==='music' ? musicOptions(selected,{seconds:Number(seconds),instrumental:false,lyrics:'',voice,speed,language}) : ({ voice: voice || undefined, response_format: format === 'auto' ? undefined : format, speed,
    ...(language !== 'auto' && !model.includes('kokoro') ? { language: /qwen|minimax/i.test(model) ? fullLanguages[language] : language } : {}) })
  const input = async (references = true) => {const signal=operation.current?.signal;const durationSeconds=kind==='voice-conversion'&&file?await voiceFileDuration(file,signal):undefined;if(durationSeconds!==undefined)validateVoiceDuration(durationSeconds,0,Number(spec?.max_source_audio_duration_seconds||300));return { kind, model, prompt, file: file || undefined,protection:saveProtected?'app':undefined,signal,durationSeconds, options: {
    ...(kind==='voice-conversion'&&!references&&durationSeconds!==undefined?{duration_seconds:Math.ceil(durationSeconds)}:{}),
    ...(kind === 'speech' ? speechOptions() : {}), ...(kind === 'voice-conversion' ? { voice: voice || spec?.default_voice, ...(spec?.supports_background_noise_removal === true ? { remove_background_noise: instrumental } : {}) } : {}), ...(kind === 'transcription' && language !== 'auto' ? { language } : {}),
    ...(kind === 'video' ? { duration, ...(aspect ? { aspect_ratio: aspect } : {}), ...(resolution ? { resolution } : {}), ...(videoSupport.audio ? { audio } : {}), ...(references && videoSupport.start && image ? { image_url: await imageDataUrl(image) } : {}), ...(references && videoSupport.end && endImage ? { end_image_url: await imageDataUrl(endImage) } : {}), ...(references && videoSupport.references && referenceImages.length ? { reference_image_urls: await Promise.all(referenceImages.map(imageDataUrl)) } : {}), ...(videoSupport.video && sourceVideo ? { video_url: await mediaFileDataUrl(sourceVideo, 'video') } : {}), ...(references && videoSupport.referenceVideos && referenceVideos.length ? { reference_video_urls: await Promise.all(referenceVideos.map(file => mediaFileDataUrl(file, 'video'))) } : {}), ...(references && videoSupport.referenceAudio && referenceAudio.length ? { reference_audio_urls: await Promise.all(referenceAudio.map(file => mediaFileDataUrl(file, 'audio'))) } : {}), ...(references && videoSupport.audioInput && audioFile ? { audio_url: await mediaFileDataUrl(audioFile, 'audio') } : {}) } : {}),
    ...((kind === 'music' || kind === 'sound-effects') ? { ...musicOptions(selected, { seconds: Number(seconds), instrumental, lyrics, loop, optimizer, voice, speed, language }) } : {}),
    ...parseExtraBody(extra),
  } }}
  const ready = enabled && !!model && (!saveProtected||!!vault?.keys.isUnlocked('app')) && (['transcription','voice-conversion'].includes(kind) ? !!file : !!prompt.trim())
  const visibleCreations=records.filter(record=>record.kind===kind).filter(record=>librarySection==='protected'?!!record.protection:!record.protection).map(record=>record.protection&&!vault?.keys.isUnlocked(record.protection)?lockedMediaRecord(record):record)
  const KindIcon = icons[kind]
  return <Stack p={{ base: 'sm', sm: 'lg' }} maw={1000} mx="auto" style={{ width: '100%' }}>
    <Group justify="space-between" gap="sm"><Group gap="sm"><ThemeIcon size={44} radius="xl" variant="light"><KindIcon size={25} /></ThemeIcon><Stack gap={2}><Title order={2}>{ft("Create with Venice")}</Title><Text size="sm" c="dimmed">{ft("Voice, video, music and sound effects in one place.")}</Text></Stack></Group>{openSettings && <Button variant="subtle" size="xs" onClick={openSettings}>{ft("Settings")}</Button>}</Group>
    {!hideTabs && <ScrollArea type="auto"><SegmentedControl aria-label={ft("Content type")} value={kind} data={Object.entries(names).map(([value, label]) => ({ value, label:ft(label) }))} onChange={value => { setKind(value as MediaKind); setModel(''); setExtra(''); setError('') }} /></ScrollArea>}
    {!enabled && <Alert color="yellow" title={ft("This feature is disabled")}>{ft("Enable it in Venice settings to get started. Saved content stays here.")}{openSettings && <Button mt="xs" size="xs" variant="light" onClick={openSettings}>{ft("Open settings")}</Button>}</Alert>}
    {error && <Alert color="red" role="alert" title={ft("Something went wrong")}>{ft(friendlyMediaError(error))}<GenerationFailureReason error={error}/></Alert>}
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}><Stack gap="lg">
      <Title order={3}>{ft(titles[kind])}</Title>
      <Group align="end" wrap="wrap"><VeniceModelSelect label={ft("Model")} placeholder={catalog.length ? ft("Choose a model") : ft("Load available models")} models={compatible} value={model || null} disabled={!compatible.length} style={{flex:1,minWidth:180}} onChange={value=>value&&pickModel(value)} />
        <Button leftSection={<IconRefresh size={16} />} variant="default" disabled={options.enabled === false || busy} onClick={() => void run(async () => setCatalog(await service.catalog()))}>{catalog.length ? ft("Refresh models") : ft("Load models")}</Button></Group>
      <Group justify="space-between"><VeniceModelBadges metadata={selected?.model_spec} /><VeniceModelInfo model={selected} /></Group>
      {selected&&<VeniceModelCost model={selected} showLabel/>}
      {vault&&<><Checkbox label={ft('Save new creations as protected')} checked={saveProtected} onChange={event=>setSaveProtected(event.currentTarget.checked)}/>{saveProtected&&!vault.keys.isUnlocked('app')&&<ScopeUnlock keys={vault.keys}/>}</>}
      {selected?.model_spec?.description && <Text size="sm" c="dimmed">{selected.model_spec.description}</Text>}
      {['transcription','voice-conversion'].includes(kind) ? <><VeniceRecorder onRecorded={setFile} compatibleFormats={kind==='voice-conversion'&&Array.isArray(spec?.accepted_audio_formats)?spec.accepted_audio_formats.map(String):undefined}/><FileInput label={kind === 'voice-conversion' ? ft("Recording to convert") : ft("Upload audio or video")} description={kind === 'voice-conversion' ? ft("Up to 25 MB. Choose a format accepted by the selected model; no upload happens until you confirm conversion.") : ft("Up to 25 MB. The file is sent to Venice only when you select Transcribe.")} placeholder={ft("Choose a file from this device")} accept={kind === 'voice-conversion' ? (Array.isArray(spec?.accepted_audio_formats) ? spec.accepted_audio_formats.map(format=>'.'+format).join(',') : 'audio/*') : 'audio/*,video/*'} value={file} onChange={setFile} clearable /></>
        : <Textarea label={kind === 'speech' ? ft("Text to read") : kind === 'video' ? ft("Describe your video") : kind === 'sound-effects' ? ft("Describe the sound effect") : ft("Describe the music or sound")} placeholder={kind === 'speech' ? ft("Type or paste the text you want to hear…") : kind === 'video' ? ft("A walk by the sea, sunset light, slow movement…") : kind === 'sound-effects' ? ft("Rain on a window, distant thunder, no music…") : ft("Relaxing jazz with piano and double bass…")} value={prompt} onChange={e => setPrompt(e.currentTarget.value)} autosize minRows={4} maxRows={10} />}
      {kind === 'speech' && <>
        {selected && !!spec?.voice_cloning && <VeniceVoiceCloning service={service} model={selected} enabled={enabled} onChoose={setVoice}/>}
        <SimpleGrid cols={{ base: 1, sm: 2 }}><Select comboboxProps={{withinPortal:false}} label={ft("Voice to use")} placeholder={model ? ft("Model default voice") : ft("Choose a model first")} description={voices.length ? ft("{{count}} voices available for this model",{count:voices.length}) : ft("If no voices are listed, the model default is used.")} searchable clearable value={voice || null} data={[...voices, ...(!voices.some(item => item.value === voice) && voice ? [{ value: voice, label: ft("Custom voice") }] : [])]} disabled={!model || !voices.length} onChange={value => setVoice(value || '')} />
          <Select comboboxProps={{withinPortal:false}} label={ft("Audio format")} disabled={selected?.type==='music'} allowDeselect={false} value={format} data={[{ value: 'auto', label: selected?.model_spec?.default_format ? ft("Recommended ({{format}})",{format:selected.model_spec.default_format.toUpperCase()}) : ft("Recommended by the model") }, ...formats.map(value => ({ value, label: value.toUpperCase() }))]} onChange={value => setFormat(value || 'auto')} /></SimpleGrid>
        {!model.includes('kokoro') && (selected?.type!=='music'||spec?.supports_language_code===true) && <Select comboboxProps={{withinPortal:false}} label={ft("Language")} value={language} allowDeselect={false} data={languages.map(item=>({...item,label:ft(item.label)}))} onChange={value => setLanguage(value || 'auto')} />}
        {(selected?.type!=='music'||spec?.supports_speed===true)&&<Stack gap={5}><Group justify="space-between"><Text size="sm" fw={500}>{ft("Reading speed")}</Text><Text size="sm" c="dimmed">{speed === 1 ? ft("Normal") : `${speed.toLocaleString(i18n.resolvedLanguage || i18n.language || 'en', { maximumFractionDigits: 2 })}×`}</Text></Group><Slider aria-label={ft("Reading speed")} value={speed} onChange={setSpeed} min={spec?.min_speed||0.25} max={spec?.max_speed||4} step={0.05} label={value => `${value.toFixed(2)}×`} /><Group justify="space-between"><Text size="xs" c="dimmed">{ft("Slower")}</Text><Text size="xs" c="dimmed">{ft("Faster")}</Text></Group></Stack>}
        <Group><Button leftSection={<IconPlayerPlay size={15} />} variant="light" size="xs" disabled={!enabled || !model || busy||saveProtected&&!vault?.keys.isUnlocked('app')} onClick={() => void run(async () => { await service.start({ kind: 'speech', model, prompt: ft("Hello! This is a short preview of the voice you selected."), options: speechOptions(),protection:saveProtected?'app':undefined,signal:operation.current?.signal }) })}>{ft("Generate a short preview")}</Button><Text size="xs" c="dimmed">{ft("The preview creates a short generation and may incur a cost.")}</Text></Group>
      </>}
      {kind === 'voice-conversion' && <><Select comboboxProps={{withinPortal:false}} label={ft("Target voice")} searchable value={voice || null} data={voices} onChange={value=>setVoice(value||'')}/>{spec?.supports_background_noise_removal === true && <Checkbox label={ft("Remove background noise")} checked={instrumental} onChange={e=>setInstrumental(e.currentTarget.checked)}/>}<Text size="xs" c="dimmed">{ft("Conversion preserves the words and delivery of your source recording. Available voices come from the selected model.")}</Text></>}
      {kind === 'transcription' && <Select comboboxProps={{withinPortal:false}} label={ft("Audio language")} value={language} allowDeselect={false} data={languages.map(item=>({...item,label:ft(item.label)}))} onChange={value => setLanguage(value || 'auto')} />}
      {kind === 'video' && <><SimpleGrid cols={{ base: 1, sm: 2 }}>{durations.length ? <Select comboboxProps={{withinPortal:false}} label={ft("Duration")} allowDeselect={false} value={duration} data={durations.map(value => ({ value, label: /^\d+s$/.test(value) ? ft("{{count}} seconds",{count:value.slice(0,-1)}) : value }))} onChange={value => setDuration(value || durations[0])} /> : <NumberInput label={ft("Duration (seconds)")} description={ft("Supported durations depend on the selected model.")} min={1} max={60} value={Number.parseInt(duration) || ''} onChange={value => setDuration(typeof value === 'number' ? value + 's' : '')} />}
        {!!ratios.length && <Select comboboxProps={{withinPortal:false}} label={ft("Aspect ratio")} clearable placeholder={ft("Automatic")} value={aspect || null} data={ratios.map(value => ({ value, label: value === '16:9' ? ft("Landscape · 16:9") : value === '9:16' ? ft("Portrait · 9:16") : value === '1:1' ? ft("Square · 1:1") : value }))} onChange={value => setAspect(value || '')} />}
        {!!resolutions.length && <Select comboboxProps={{withinPortal:false}} label={ft("Video quality")} clearable placeholder={ft("Recommended by the model")} value={resolution || null} data={resolutions} onChange={value => setResolution(value || '')} />}</SimpleGrid>
        {videoSupport.start && <FileInput cropImages label={ft("Start image")} description={ft("For models that animate images. PNG, JPEG or WebP, up to 10 MB.")} placeholder={ft("Choose an image from this device")} accept="image/png,image/jpeg,image/webp" value={image} onChange={setImage} clearable />}
        {videoSupport.end && <FileInput cropImages label={ft("End frame")} accept="image/png,image/jpeg,image/webp" value={endImage} onChange={setEndImage} clearable />}
        {videoSupport.references && <FileInput cropImages multiple label={ft("Reference images")} description={ft("Up to 4 images. Check the model details for additional limits.")} accept="image/png,image/jpeg,image/webp" value={referenceImages} onChange={files => setReferenceImages(files.slice(0, 4))} clearable />}
        {videoSupport.video && <FileInput label={ft("Video to edit or extend")} description={ft("MP4, MOV or WebM, up to 50 MB.")} accept="video/mp4,video/quicktime,video/webm" value={sourceVideo} onChange={setSourceVideo} clearable />}
        {videoSupport.referenceVideos && <FileInput multiple label={ft("Reference videos")} description={ft("Up to 4 clips; check duration and limits in the model details.")} accept="video/mp4,video/quicktime" value={referenceVideos} onChange={files => setReferenceVideos(files.slice(0, 4))} clearable />}
        {videoSupport.referenceAudio && <FileInput multiple label={ft("Reference audio")} description={ft("WAV or MP3; attach at least one reference image or video.")} accept="audio/wav,audio/mpeg" value={referenceAudio} onChange={files => setReferenceAudio(files.slice(0, 4))} clearable />}
        {videoSupport.audioInput && <FileInput label={ft("Audio to use in the video")} accept="audio/wav,audio/mpeg" value={audioFile} onChange={setAudioFile} clearable />}
        {videoSupport.audio && <Checkbox label={ft("Generate video audio")} checked={audio} onChange={e => setAudio(e.currentTarget.checked)} />}
      </>}
      {(kind === 'music' || kind === 'sound-effects') && <>
        {music.supported && (music.choices.length ? <Select comboboxProps={{withinPortal:false}} label={ft("Duration")} allowDeselect={false} value={String(seconds)} data={music.choices.map(value => ({ value: String(value), label: ft("{{count}} seconds",{count:value}) }))} onChange={value => setSeconds(Number(value))} /> : <NumberInput label={ft("Duration (seconds)")} min={music.min} max={music.max} value={seconds} onChange={setSeconds} />)}
        {spec?.supports_force_instrumental === true && <Checkbox label={ft("Instrumental only")} checked={instrumental} onChange={e => setInstrumental(e.currentTarget.checked)} />}
        {spec?.supports_lyrics === true && !instrumental && <Textarea required={spec.lyrics_required && !optimizer} label={spec.lyrics_required ? ft("Lyrics (required)") : ft("Lyrics (optional)")} description={spec.lyrics_character_limit ? ft("Maximum {{count}} characters",{count:spec.lyrics_character_limit}) : undefined} value={lyrics} onChange={e => setLyrics(e.currentTarget.value)} disabled={optimizer} autosize minRows={2} />}
        {spec?.supports_lyrics_optimizer === true && <Checkbox label={ft("Generate lyrics automatically")} checked={optimizer} onChange={e => { setOptimizer(e.currentTarget.checked); if (e.currentTarget.checked) setLyrics('') }} />}
        {spec?.supports_loop === true && <Checkbox label={ft("Create a seamless loop")} checked={loop} onChange={e => setLoop(e.currentTarget.checked)} />}
        {!!voices.length && <Select comboboxProps={{withinPortal:false}} label={ft("Voice to use")} data={voices} value={voice || null} onChange={value => setVoice(value || '')} />}
        {spec?.supports_language_code === true && <Select comboboxProps={{withinPortal:false}} label={ft("Language")} data={languages.map(item=>({...item,label:ft(item.label)}))} value={language} onChange={value => setLanguage(value || 'auto')} />}
        {spec?.supports_speed === true && <NumberInput label={ft("Speed")} min={spec.min_speed || 0.25} max={spec.max_speed || 4} step={0.05} value={speed} onChange={value => setSpeed(Number(value) || 1)} />}
        {kind==='music'&&<Text size="xs" c="dimmed">{ft('Audio-reference remix is not exposed by the current Venice music API. Only supported inputs are shown.')}</Text>}<Text size="xs" c="dimmed">{ft("Only options declared by this model are shown. Settings reset when you change models.")}</Text>
      </>}
      <Accordion value={advanced} onChange={setAdvanced} variant="contained" radius="md"><Accordion.Item value="advanced"><Accordion.Control>{ft("Advanced options")}</Accordion.Control><Accordion.Panel><Stack gap="sm">
        <Text size="xs" c="dimmed">{ft("For custom configurations. All main features work without changing these fields.")}</Text>
        <TextInput label={ft("Custom model ID")} value={model} onChange={e => { setModel(e.currentTarget.value); setVoice(''); setFormat('auto') }} />
        {kind === 'speech' && <TextInput label={ft("Custom voice ID")} value={voice} onChange={e => setVoice(e.currentTarget.value)} />}
        <Textarea label={ft("Extra parameters JSON (optional)")} description={ft("Extra parameters override the controls above.")} value={extra} onChange={e => setExtra(e.currentTarget.value)} autosize minRows={2} />
      </Stack></Accordion.Panel></Accordion.Item></Accordion>
      {quote && <Paper p="sm" radius="md" bg="var(--mantine-color-blue-light)"><Text role="status">{ft("Estimated cost from Venice:")}<strong>{quote}</strong></Text></Paper>}
      <Group justify="space-between"><Text size="xs" c="dimmed" maw={480}>{ft("Content is sent to Venice and saved on this device. Generation may incur a cost.")}</Text><Group>{(['video', 'music', 'sound-effects','voice-conversion'].includes(kind)||kind==='speech'&&selected?.type==='music') && <Button variant="default" disabled={!enabled || !model || busy || kind==='voice-conversion'&&!file || (kind === 'video' && !duration)} onClick={() => void run(async () => setQuote(quoteLabel(await service.quote(await input(false)), i18n.resolvedLanguage || i18n.language || "en")))}>{ft("Show cost")}</Button>}<Button disabled={!ready || busy || (kind === 'video' && !duration)} loading={busy} onClick={() => void run(async () => { await service.start(await input()) })}>{ft(actions[kind])}</Button></Group></Group>
    </Stack></Paper>
    <Group justify="space-between" mt="sm"><Title order={3}>{ft("Your creations")}</Title><Badge variant="light">{ft("Saved on device")}</Badge></Group>
    {vault&&<SegmentedControl aria-label={ft('Creation history protection')} value={librarySection} onChange={value=>{setLibrarySection(value);setOpenRecordId(null);setVisibleRecords(20)}} data={[{value:'public',label:ft('Public')},{value:'protected',label:ft('Protected')}]}/>}
    {!visibleCreations.length && <Paper withBorder p="xl" radius="lg"><Stack align="center" gap="xs"><ThemeIcon size={48} variant="light" radius="xl"><KindIcon /></ThemeIcon><Text fw={500}>{ft("Your first creation is waiting")}</Text><Text size="sm" c="dimmed" ta="center">{ft("Your results will appear here. Play, export or delete them whenever you want.")}</Text></Stack></Paper>}
    {visibleCreations.slice(0,visibleRecords).map(record => <ProtectedPreviewGate key={record.id} scope={record.protection}><MediaResult record={record} opened={record.id===openRecordId} onToggle={()=>setOpenRecordId(current=>current===record.id?null:record.id)} modelName={catalog.find(model => model.id === record.model)?.model_spec?.name || readableName(record.model)} service={service} enabled={mediaEnabled(record.kind, options)} run={run} onProtectionChange={vault?async scope=>{await vault.media.setProtection(record.id,scope);vault.keys.refresh()}:undefined}/></ProtectedPreviewGate>)}
    {visibleRecords < visibleCreations.length && <Button variant="subtle" onClick={()=>setVisibleRecords(count=>count+20)}>{ft("Show more creations")}</Button>}
    <Text size="xs" c="dimmed">{ft("Audio, video and music do not use E2EE. Stopping the wait may not cancel the job or its cost on Venice.")}</Text>
  </Stack>
}
function MediaResult({ record, modelName, service, enabled, run, opened, onToggle,onProtectionChange }: { onProtectionChange?:(scope?:string)=>Promise<void>;opened:boolean; onToggle:()=>void; record: MediaRecord; modelName: string; service: Service; enabled: boolean; run: (work: () => Promise<unknown>) => Promise<void> }) {
  const {i18n}=useTranslation()
  const [content, setContent] = useState<string | null>(null); const [loadError, setLoadError] = useState('')
  useEffect(() => { if(!opened||record.protectedRecord) {setContent(null);setLoadError('');return} let live = true; void service.content(record).then(value => { if (live) setContent(value) }).catch(() => { if (live) setLoadError(ft("Unable to read local content")) }); return () => { live = false } }, [record.blobKey, record.id, service, opened,record.protectedRecord])
  const transcript=useMemo(()=>{if(!opened||record.protectedRecord)return {text:null,error:''};try{return{text:record.text||localText(content),error:''}}catch{return{text:null,error:ft('Unable to read local content')}}},[opened,record.protectedRecord,record.text,content])
  if(record.protectedRecord){const vault=installedVaultFor(platform);return <Paper withBorder radius="lg" p="md">{vault?<CreationUnlock keys={vault.keys} protection={record.protection}/>:<Text>{ft('Locked creation')}</Text>}</Paper>}
  const safe = content && /^(data:audio\/[\w.+-]+;base64,|data:video\/mp4;base64,)/.test(content) ? content : null
  const statuses = { ready: ft("Ready"), creating: ft("Starting"), queued: ft("Processing"), paused: ft("Paused"), error: ft("Needs attention") }
  return <Paper withBorder radius="lg" p="md"><Stack gap="sm">
    <Group justify="space-between"><Stack gap={2}><Text fw={600}>{ft(names[record.kind])} · {modelName}</Text><Text size="xs" c="dimmed">{new Date(record.createdAt).toLocaleString(i18n.resolvedLanguage || i18n.language || 'en')}</Text></Stack><Badge color={record.status === 'ready' ? 'green' : record.status === 'error' ? 'orange' : 'blue'} variant="light">{statuses[record.status]}</Badge></Group>
    <Text lineClamp={3} style={{ overflowWrap: 'anywhere' }}>{record.prompt}</Text>
    {service.isActive(record.id) && <Group><Loader size="xs" /><Text size="sm">{ft("Your content is being prepared…")}</Text><Button size="xs" variant="default" onClick={() => void run(() => service.pause(record.id))}>{ft("Stop waiting")}</Button></Group>}
    {transcript.text && <Paper p="sm" bg="var(--mantine-color-default-hover)"><Text style={{ whiteSpace: 'pre-wrap' }}>{transcript.text}</Text></Paper>}
    {(record.blobKey||record.text) && <Button size="xs" variant="light" onClick={onToggle}>{opened?ft("Close preview"):ft("Open preview")}</Button>}
    {opened && safe && (record.kind === 'video' ? <video aria-label={ft("Generated video")} controls src={safe} style={{ width: '100%', maxHeight: 500, borderRadius: 8 }} /> : <audio aria-label={ft("Generated audio")} controls src={safe} style={{ width: '100%' }} />)}
    {(loadError||transcript.error) && <Text c="red">{loadError||transcript.error}</Text>}
    {record.error && <Alert color="orange">{ft(friendlyMediaError(record.error))}<GenerationFailureReason error={record.error}/></Alert>}
    {record.queueId && !service.isActive(record.id) && record.status !== 'ready' && <Button disabled={!enabled} variant="light" onClick={() => void run(() => service.resume(record.id))}>{ft("Resume processing")}</Button>}
    <Group justify="space-between"><Group>
      {onProtectionChange&&!service.isActive(record.id)&&<Button size="xs" variant="default" onClick={()=>void run(()=>onProtectionChange(record.protection?undefined:'app'))}>{record.protection?ft('Make this creation public'):ft('Protect this creation')}</Button>}
      {(record.blobKey || record.text) && <Button size="xs" variant="default" onClick={() => void run(async () => {
        const extension=record.kind==='transcription'||record.mime==='text/plain'?'txt':record.mime==='video/mp4'?'mp4':record.mime?.includes('wav')?'wav':record.mime?.includes('flac')?'flac':record.mime?.includes('ogg')?'ogg':record.mime?.includes('opus')?'opus':record.mime?.includes('aac')?'aac':record.mime?.includes('pcm')?'pcm':'mp3'
        const name=`Venice-${record.id}.${extension}`,vault=installedVaultFor(platform),header=record.blobKey?await vault?.find(record.blobKey):null
        if(vault&&header){const controller=new AbortController();const result=await platform.exporter.exportStreamingFile(name,async function*(){for await(const bytes of vault.assets.read(`vault-asset-${header.id}`)){try{yield bytes}finally{bytes.fill(0)}}},record.mime||'application/octet-stream',controller.signal,{requiresStreaming:true});if(!result.boundedMemory)throw new Error(ft('This device did not provide streaming export'));return}
        if(record.text){await platform.exporter.exportTextFile(name,record.text);return}
        const value=safe||await service.content(record);if(record.mime==='text/plain'){const text=localText(value);if(text===null)throw new Error(ft('Unable to read local content'));await platform.exporter.exportTextFile(name,text)}
        else{if(!value||!/^data:(audio\/[\w.+-]+|video\/mp4);base64,/.test(value))throw new Error(ft('Unable to read local content'));await platform.exporter.exportBlob(name,await(await fetch(value)).blob())}
      })}>{ft("Export")}</Button>}
      {record.queueId && !record.remoteCleaned && <Button size="xs" variant="default" disabled={!enabled} onClick={() => void run(() => service.cleanup(record.id))}>{ft("Delete copy on Venice")}</Button>}
    </Group><Button size="xs" color="red" variant="subtle" onClick={() => void run(() => service.remove(record.id))}>{ft("Delete from device")}</Button></Group>
    {!!record.queueId && <Text size="xs" c="dimmed">{record.remoteCleaned ? ft("Remote copy deleted, as confirmed by Venice.") : ft("Deleting from this device leaves the copy on Venice. Use the dedicated button to delete it.")}</Text>}
  </Stack></Paper>
}
