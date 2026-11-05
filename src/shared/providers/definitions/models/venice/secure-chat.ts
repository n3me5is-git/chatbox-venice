import { bytesToHex, decryptChunk, deriveSigningAddressFromKey, encryptMessage, generateEphemeralKeyPair, isHexEncrypted, verifySignature } from './crypto'
import { buildTeeVerificationResult, evaluateE2EEAttestationPolicy, evaluateTEEAttestationPolicy, type TeeAttestationResponse } from './tee'

type Body = Record<string, any>
const MAX_RESPONSE = 16 * 1024 * 1024
const safeOptions = new Set(['model','messages','stream','stream_options','max_tokens','max_completion_tokens','temperature','top_p','frequency_penalty','presence_penalty','stop','seed','reasoning_effort','venice_parameters'])

/** The official protocol encrypts user/system messages. Pack history into encrypted user content
 * so prior assistant replies are never resent in plaintext. Tools and attachments are deliberately
 * rejected until an encrypted protocol for their complete payload exists. */
export function encryptConversation(messages: Body[], key: string) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('E2EE requires text messages')
  const text = messages.map(message => {
    if (!['system','developer','user','assistant'].includes(message.role) || Object.keys(message).some(key => !['role','content'].includes(key))) throw new Error('E2EE currently supports text chat without tool calls')
    const content = typeof message.content === 'string' ? message.content : Array.isArray(message.content) && message.content.every((part: Body) => part.type === 'text' && typeof part.text === 'string') ? message.content.map((part: Body) => part.text).join('\n') : undefined
    if (content === undefined) throw new Error('E2EE does not support image, audio, video or file attachments')
    return { role: message.role, content }
  })
  const system = text.filter(message => ['system','developer'].includes(message.role)).map(message => ({ role: 'system', content: encryptMessage(message.content, key) }))
  const history = text.filter(message => ['user','assistant'].includes(message.role))
  const content = history.some(message => message.role === 'assistant') ? `Continue the conversation represented by the following JSON history. Reply to the last user message. Preserve the distinction between the user and assistant roles.\n${JSON.stringify(history)}` : history.map(message => message.content).join('\n\n')
  return [...system, { role: 'user', content: encryptMessage(content, key) }]
}

async function boundedText(response: Response) {
  if (!response.body) throw new Error('Empty secure response')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
  try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > MAX_RESPONSE) throw new Error('Secure response exceeds the local verification limit'); chunks.push(next.value) } }
  catch (error) { await reader.cancel().catch(() => {}); throw error }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return new TextDecoder().decode(bytes)
}
export async function secureVeniceChat(fetch: typeof globalThis.fetch, endpoint: string, init: RequestInit, body: Body, mode: 'tee' | 'e2ee') {
  const base = endpoint.replace(/\/chat\/completions(?:\?.*)?$/, '')
  const headers = new Headers(init.headers); headers.delete('content-length')
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
  const get = async (path: string) => { const response = await fetch(`${base}${path}`, { method: 'GET', headers, signal: init.signal }); if (!response.ok) throw new Error(`Venice secure verification failed (HTTP ${response.status})`); return response.json() }
  const report = await get(`/tee/attestation?model=${encodeURIComponent(body.model)}&nonce=${nonce}`) as TeeAttestationResponse
  const evidence = buildTeeVerificationResult(report, nonce, body.model)
  const evaluation = mode === 'e2ee' ? evaluateE2EEAttestationPolicy(evidence, body.model) : evaluateTEEAttestationPolicy(evidence, body.model)
  if (!evaluation.passed) throw new Error('Venice secure attestation rejected: ' + evaluation.failures.join(' '))
  const signingAddress = evidence.signingKey ? deriveSigningAddressFromKey(evidence.signingKey) : evidence.signingAddress
  if (!signingAddress) throw new Error('The enclave did not provide a response signing identity')
  const pair = mode === 'e2ee' ? generateEphemeralKeyPair() : undefined
  try {
    const request: Body = { ...body, venice_parameters: { ...body.venice_parameters, enable_e2ee: mode === 'e2ee' } }
    if (pair) {
      if (Object.keys(request).some(key => !safeOptions.has(key))) throw new Error('E2EE does not allow tool definitions, schemas or additional request fields')
      request.messages = encryptConversation(body.messages, evidence.signingKey!)
      request.venice_parameters = { enable_e2ee: true, include_venice_system_prompt: false, enable_web_search: 'off', enable_web_scraping: false, enable_x_search: false, enable_web_citations: false, include_search_results_in_stream: false, strip_thinking_response: true }
      headers.set('X-Venice-TEE-Client-Pub-Key', pair.publicKeyHex); headers.set('X-Venice-TEE-Model-Pub-Key', evidence.signingKey!); headers.set('X-Venice-TEE-Signing-Algo', 'ecdsa')
    }
    const sent = JSON.stringify(request)
    const response = await fetch(endpoint, { ...init, headers, body: sent })
    if (!response.ok) throw new Error(`Venice secure chat failed (HTTP ${response.status}); no plaintext retry was attempted`)
    const raw = await boundedText(response)
    const streaming = (response.headers.get('content-type') || '').includes('text/event-stream')
    let completionId = ''; let plain = '';let encryptedContent=''
    const decode = (frame: Body) => {
      if (typeof frame.id === 'string') completionId ||= frame.id
      for (const choice of frame.choices || []) {
        const message = choice.delta || choice.message
        if (!message) continue
        if (pair && (message.tool_calls?.length || message.function_call || message.reasoning_content || message.refusal)) throw new Error('The E2EE response contained an unsupported unencrypted field')
        if (typeof message.content === 'string' && message.content) {
          if (pair) { if (!isHexEncrypted(message.content)) throw new Error('The E2EE response was not encrypted');encryptedContent+=message.content; message.content = decryptChunk(message.content, pair.privateKey) }
          plain += message.content
        }
      }
      return frame
    }
    let output: string
    if (streaming) {
      output = raw.split(/\r?\n\r?\n/).filter(Boolean).map(event => {
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data || data === '[DONE]') return event
        return 'data: ' + JSON.stringify(decode(JSON.parse(data)))
      }).join('\n\n') + '\n\n'
    } else output = JSON.stringify(decode(JSON.parse(raw)))
    if (!completionId) throw new Error('The secure response has no request ID for signature verification')
    const signature = await get(`/tee/signature?model=${encodeURIComponent(body.model)}&request_id=${encodeURIComponent(completionId)}`)
    if (signature.model && signature.model !== body.model || signature.request_id && signature.request_id !== completionId || signature.requested_request_id && signature.requested_request_id !== completionId) throw new Error('TEE signature belongs to another request or model')
    const signatureHex = typeof signature.signature === 'string' ? signature.signature : signature.signature?.value
    const payload=signature.payload;const pairText=typeof payload?.request_hash==='string'&&typeof payload?.response_hash==='string'?`${payload.request_hash}:${payload.response_hash}`:undefined
    const signedText=signature.text??pairText
    if (typeof signedText !== 'string' || typeof signatureHex !== 'string'||pairText&&pairText!==signedText) throw new Error('TEE response signature was not available or consistent; unverified output was withheld')
    // E2EE signatures must bind the exact encrypted request, including its fresh
    // ciphertext. Only hashes are accepted as its signature payload.
    const direct = mode==='tee'&&verifySignature({ signedText, signatureHex, expectedSigningAddress: signingAddress, expectedContent: plain }).verified
    const hashed = [raw,plain,...(pair?[encryptedContent]:[])].some(content=>verifySignature({ signedText, signatureHex, expectedSigningAddress: signingAddress, expectedRequest: sent, expectedContent: content }).verified)
    if (!direct && !hashed) throw new Error('TEE response signature did not bind the attested key, exact request and received content')
    // Release output only after verification. This intentionally buffers secure streams on device.
    const outHeaders = new Headers(response.headers); outHeaders.delete('content-length'); outHeaders.delete('content-encoding')
    return new Response(output, { status: response.status, statusText: response.statusText, headers: outHeaders })
  } finally { pair?.privateKey.fill(0) }
}
