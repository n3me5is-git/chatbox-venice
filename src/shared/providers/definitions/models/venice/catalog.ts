import type { MediaCatalogItem } from './media'
export const mediaTypes = { speech: 'tts', transcription: 'asr', video: 'video', music: 'music', 'sound-effects': 'music' } as const
export function readableName(id: string) {
  return id.replace(/^(?:tts|asr)[-_]/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
export function voiceChoices(model?: MediaCatalogItem, translate: (key:string)=>string = key=>key) {
  const languages: Record<string, string> = { a: "English (US)", b: "English (UK)", e: "Spanish", f: "French", h: 'Hindi', i: "Italian", j: "Japanese", p: "Portuguese (Brazil)", z: "Chinese" }
  const voices = [...new Set((Array.isArray(model?.model_spec?.voices) ? model.model_spec.voices : []).filter((voice): voice is string => typeof voice === 'string' && !!voice))]
  return voices.map(voice => {
    const kokoro = model?.id.includes('kokoro') && /^([a-z])[fm]_(.+)$/.exec(voice)
    const name = kokoro ? `${readableName(kokoro[2])} · ${translate(languages[kokoro[1]] || kokoro[1])}` : readableName(voice)
    return { value: voice, label: name + (voice === model?.model_spec?.default_voice ? ' · ' + translate('Recommended') : '') }
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
export function quoteLabel(result: unknown, locale = 'en') {
  const amount = result && typeof result === 'object' ? (result as { quote?: unknown }).quote : undefined
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error("Venice did not return a valid cost")
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(amount)
}
export function friendlyMediaError(error: string) {
  if (/^Use a PNG|^Unable to read|model|duration|lyrics|unsupported reference/i.test(error)) return error
  if (/429|rate.?limit/i.test(error)) return 'Too many requests right now. Wait before trying again.'
  if (/401|403|API key|credentials|original.*key/i.test(error)) return "Check your Venice key and model permissions in settings."
  if (/JSON|Unexpected token|property name|Invalid JSON|streaming.*settings/i.test(error)) return "Check the advanced parameters: the format is invalid."
  if (/disabled/i.test(error)) return "This feature is disabled. Enable it in Venice settings."
  if (/size limit|exceeds.*MB/i.test(error)) return "The file exceeds the allowed size. Use a smaller file."
  if (/400|422/.test(error)) return "The model does not accept these options. Check the voice, duration and settings, or choose another model."
  if (/AbortError|Paused|aborted/i.test(error)) return "Waiting stopped. If the job has started, you can resume it from history."
  return "This operation could not be completed. Generation will not be retried automatically."
}
