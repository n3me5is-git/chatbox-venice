import { z } from 'zod'

/** Local evidence emitted only after the secure transport verified a response. */
export const ResponseSecuritySchema = z.object({
  mode: z.enum(['e2ee', 'tee']),
  receipt: z.enum(['payload-bound', 'gateway-signature-only']),
  tools: z.enum(['none', 'encrypted-text', 'native']),
  modelId: z.string().max(256),
  verifiedAt: z.number().finite(),
  responses: z.number().int().min(1).max(10000),
})
export type ResponseSecurity = z.infer<typeof ResponseSecuritySchema>
export const SECURITY_INFO = 'chatbox:verified-response'

export function mergeResponseSecurity(previous: ResponseSecurity | undefined, current: ResponseSecurity): ResponseSecurity {
  if (!previous) return current
  return { ...current, responses: previous.responses + current.responses,
    mode: previous.mode === 'tee' || current.mode === 'tee' ? 'tee' : 'e2ee',
    tools: previous.tools === 'native' || current.tools === 'native' ? 'native' : previous.tools === 'encrypted-text' || current.tools === 'encrypted-text' ? 'encrypted-text' : 'none',
    receipt: previous.receipt === 'gateway-signature-only' || current.receipt === 'gateway-signature-only' ? 'gateway-signature-only' : 'payload-bound' }
}
