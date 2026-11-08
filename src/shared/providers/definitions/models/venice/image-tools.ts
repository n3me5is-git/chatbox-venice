import type { ToolSet } from 'ai'
import { validatedToolSchema } from '../../../../validated-tool-schema'
import type { VeniceOptions } from './options'
export interface ImageChoice { modelId: string; prompt: string; count: number; aspectRatio: string; referenceImages: string[]; extraBody?: Record<string, unknown> }
export interface VeniceImageToolHost {
  models(): Promise<{ modelId: string; name: string; capabilities?: unknown; metadata?: unknown }[]>;
  choose(request: { modelId?: string; prompt: string; count: number }, signal?: AbortSignal): Promise<ImageChoice | null>;
  generate(choice: ImageChoice, callId: string): Promise<unknown>;
  status(id: string): Promise<unknown>;
  previous(callId: string): Promise<unknown | null>;
}
export function buildVeniceImageTools(host: VeniceImageToolHost, settings: () => VeniceOptions): ToolSet {
  return { venice_image: {
    description: 'Generate or edit images directly through Venice. Use models to inspect the live catalog. If the user names a model (for example GPT Flare), resolve that exact catalog name or ID and pass model; do not choose a different model. Ambiguous or missing names are resolved by the user dialog. Generation follows the user-selected approval policy for this chat. By default a dialog asks for the model, references, batch count and paid-request approval. The human can remember similar generations or explicitly enable automatic approval for this chat; the tool cannot change that policy. Unknown or ambiguous models and required reference uploads still need a dialog. Results are saved locally in Image Creator and Venice Studio. Reuse status to inspect a record; never repeat paid generation to poll.',
    inputSchema: validatedToolSchema({ type: 'object', properties: { action: { type: 'string', enum: ['models', 'generate', 'status'] }, model: { type: 'string' }, prompt: { type: 'string' }, count: { type: 'integer', minimum: 1, maximum: 4 }, id: { type: 'string' } }, required: ['action'], additionalProperties: false }),
    execute: async (raw, context) => {
      const input = raw as { action: string; model?: string; prompt?: string; count?: number; id?: string }
      const allowed = () => { context.abortSignal?.throwIfAborted(); if (settings().enabled === false || settings().chatToolsEnabled === false) throw new Error('Venice tools are disabled') }
      allowed()
      if (input.action === 'models') return host.models()
      if (input.action === 'status') { if (!input.id) throw new Error("Provide an image record ID"); return host.status(input.id) }
      if (input.action !== 'generate' || !input.prompt?.trim() || (input.count !== undefined && (!Number.isInteger(input.count) || input.count < 1 || input.count > 4))) throw new Error("Provide a prompt and a quantity from 1 to 4")
      const prior = await host.previous(context.toolCallId); if (prior) return prior
      const choice = await host.choose({ modelId: input.model, prompt: input.prompt, count: input.count || 1 }, context.abortSignal)
      if (!choice) return { cancelled: true, message: 'The user skipped or cancelled this generation. Do not retry or reopen approval without a new user request.' }
      allowed()
      if (!(await host.models()).some(model => model.modelId === choice.modelId)) throw new Error("The selected model is no longer available")
      return host.generate(choice, context.toolCallId)
    },
  } }
}
