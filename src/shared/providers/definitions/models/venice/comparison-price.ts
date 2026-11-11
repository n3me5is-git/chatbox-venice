import reference from './price-reference.json'
import type { MediaCatalogItem } from './media'
import { quickModelPrice } from './pricing'

export interface ComparisonPrice {
  amount: number; currency: 'USD' | 'DIEM'; basis: 'video' | 'audio' | 'track'
  resolution?: string; sourceSeconds?: number; normalized?: boolean; speechEstimate?: boolean; audio?: string; quotedAt?: string
}
type Reference = Omit<ComparisonPrice, 'currency'>
const prices = reference.models as Record<string, Reference>
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** A comparable small workload, never a promise of the final generation cost.
 * Live declared audio units take precedence over the bundled public documentation.
 * Tier prices are not linearly interpolated when the requested duration exists. */
export function mediaComparisonPrice(model: MediaCatalogItem): ComparisonPrice | undefined {
  const rate = quickModelPrice(model)
  if (model.type === 'video') {
    const known = prices[model.id]
    return known?.basis === 'video' && valid(known.amount) ? { ...known, currency: 'USD' } : undefined
  }
  if (!['tts', 'asr', 'stt', 'music', 'audio'].includes(model.type)) return undefined
  const voice = model.type === 'tts' || rate?.unit === '1,000 characters'
  if (rate && voice && ['1M characters', '1,000 characters'].includes(rate.unit)) return {
    amount: rate.amount * reference.assumedSpeechCharacters / (rate.unit === '1M characters' ? 1_000_000 : 1000), currency: rate.currency, basis: 'audio', speechEstimate: true,
  }
  if (rate?.unit === 'second' && !rate.from) return { amount: rate.amount * 30, currency: rate.currency, basis: 'audio' }
  const durations = model.model_spec?.pricing?.durations
  if (durations && typeof durations === 'object') {
    const tiers = Object.values(durations).filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
    const tier = tiers.find(row => valid(row.min_seconds) && valid(row.max_seconds) && row.min_seconds <= 30 && row.max_seconds >= 30)
    if (tier && (valid(tier.usd) || valid(tier.diem))) return { amount: valid(tier.usd) ? tier.usd : Number(tier.diem), currency: valid(tier.usd) ? 'USD' : 'DIEM', basis: 'audio' }
  }
  const known = prices[model.id]
  return known && known.basis !== 'video' && valid(known.amount) ? { ...known, currency: 'USD' } : undefined
}
