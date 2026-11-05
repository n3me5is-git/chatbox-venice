import type { ImageModelOption } from '@/packages/image-model-catalog'
const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
export function resolveRequestedVeniceImageModel(models: Pick<ImageModelOption, 'modelId' | 'displayName'>[], requested?: string, prompt = '') {
  if (requested?.trim()) {
    const key = normalize(requested)
    const exactId = models.filter(model => normalize(model.modelId) === key)
    const candidates = exactId.length ? exactId : models.filter(model => normalize(model.displayName) === key)
    if (candidates.length === 1) return { modelId: candidates[0].modelId }
    return { message: candidates.length ? 'Il nome corrisponde a più modelli: scegli quello desiderato.' : `Il modello “${requested}” non è nel catalogo disponibile. Scegli un modello prima di generare.` }
  }
  // The chat model can pass an explicit ID/name. This fallback recognizes only whole
  // catalog names in the prompt; it never guesses a provider from an approximate match.
  const words = (text: string) => text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const haystack = ` ${words(prompt)} `
  const matches = models.filter(model => [model.modelId, model.displayName].some(name => words(name).length >= 5 && haystack.includes(` ${words(name)} `)))
  return matches.length === 1 ? { modelId: matches[0].modelId } : { message: matches.length ? 'Sono menzionati più modelli: scegli quale usare.' : 'Scegli il modello e controlla le impostazioni della chiamata.' }
}
