import type { MediaCatalogItem } from './media'
export const mediaTypes = { speech: 'tts', transcription: 'asr', video: 'video', music: 'music' } as const
export function readableName(id: string) {
  return id.replace(/^(?:tts|asr)[-_]/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
export function voiceChoices(model?: MediaCatalogItem) {
  const languages: Record<string, string> = { a: 'Inglese USA', b: 'Inglese UK', e: 'Spagnolo', f: 'Francese', h: 'Hindi', i: 'Italiano', j: 'Giapponese', p: 'Portoghese BR', z: 'Cinese' }
  const voices = [...new Set((Array.isArray(model?.model_spec?.voices) ? model.model_spec.voices : []).filter((voice): voice is string => typeof voice === 'string' && !!voice))]
  return voices.map(voice => {
    const kokoro = model?.id.includes('kokoro') && /^([a-z])[fm]_(.+)$/.exec(voice)
    const name = kokoro ? `${readableName(kokoro[2])} · ${languages[kokoro[1]] || kokoro[1]}` : readableName(voice)
    return { value: voice, label: name + (voice === model?.model_spec?.default_voice ? ' · Consigliata' : '') }
  })
}
export function supportedValues(model: MediaCatalogItem | undefined, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = model?.model_spec?.constraints?.[key]
    const choices = Array.isArray(value) ? value : value && typeof value === 'object' ? (value as Record<string, unknown>).enum ?? (value as Record<string, unknown>).values ?? (value as Record<string, unknown>).options : undefined
    if (Array.isArray(choices)) return [...new Set(choices.filter(value => typeof value === 'string' || typeof value === 'number').map(String))]
  }
  return []
}
export function audioFormats(model?: MediaCatalogItem) {
  return [...new Set((Array.isArray(model?.model_spec?.supported_formats) ? model.model_spec.supported_formats : []).filter(format => ['mp3', 'wav', 'opus', 'aac', 'flac', 'pcm'].includes(format)))]
}
export function quoteLabel(result: unknown) {
  const amount = result && typeof result === 'object' ? (result as { quote?: unknown }).quote : undefined
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error('Venice non ha restituito un costo valido')
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(amount)
}
export function friendlyMediaError(error: string) {
  if (/Usa un’immagine|Impossibile leggere/i.test(error)) return error
  if (/429|rate.?limit/i.test(error)) return 'Troppe richieste in questo momento. Attendi prima di riprovare.'
  if (/401|403|API key|credentials|original.*key/i.test(error)) return 'Controlla la chiave Venice e i permessi del modello nelle impostazioni.'
  if (/JSON|Unexpected token|property name|Invalid JSON|streaming.*settings/i.test(error)) return 'Controlla i parametri nelle opzioni avanzate: il formato non è valido.'
  if (/disabled/i.test(error)) return 'Questa funzione è disattivata. Puoi abilitarla nelle impostazioni Venice.'
  if (/size limit|exceeds.*MB/i.test(error)) return 'Il file supera il limite consentito. Usa un file più piccolo.'
  if (/400|422/.test(error)) return 'Il modello non accetta queste opzioni. Controlla voce, durata e impostazioni oppure scegli un altro modello.'
  if (/AbortError|Paused|aborted/i.test(error)) return 'Attesa interrotta. Se il lavoro è già iniziato, puoi riprenderlo dalla cronologia.'
  return 'Non è stato possibile completare questa operazione. La generazione non viene ripetuta automaticamente.'
}
