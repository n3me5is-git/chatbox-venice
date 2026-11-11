import type { ProviderModelInfo } from '../types'

// Local safety ceiling, not an account entitlement or a promise about a private
// endpoint. The server's account/model-specific errors remain authoritative.
export const SUBSCRIPTION_REFERENCE_LIMIT = 16
export function subscriptionReferenceLimit(model?:Pick<ProviderModelInfo,'vendorMetadata'>) {
  const declared=Number(model?.vendorMetadata?.maxInputImages)
  return Number.isSafeInteger(declared)&&declared>0?Math.min(declared,SUBSCRIPTION_REFERENCE_LIMIT):SUBSCRIPTION_REFERENCE_LIMIT
}
