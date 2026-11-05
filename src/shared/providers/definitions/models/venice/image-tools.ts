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
    description: 'Generate or edit images directly through Venice. Use models to inspect the live catalog. If the user names a model (for example GPT Flare), resolve that exact catalog name or ID and pass model; do not choose a different model. Ambiguous or missing names are resolved by the user dialog. Generate always opens a user dialog to choose the model, references, batch count and approve the paid request. Never bypass that choice. Results are saved locally in Image Creator and Venice Studio. Reuse status to inspect a record; never repeat paid generation to poll.',
    inputSchema: validatedToolSchema({ type: 'object', properties: { action: { type: 'string', enum: ['models', 'generate', 'status'] }, model: { type: 'string' }, prompt: { type: 'string' }, count: { type: 'integer', minimum: 1, maximum: 4 }, id: { type: 'string' } }, required: ['action'], additionalProperties: false }),
    execute: async (raw, context) => {
      const input = raw as { action: string; model?: string; prompt?: string; count?: number; id?: string }
      const allowed = () => { context.abortSignal?.throwIfAborted(); if (settings().enabled === false || settings().chatToolsEnabled === false) throw new Error('Gli strumenti Venice sono disattivati') }
      allowed()
      if (input.action === 'models') return host.models()
      if (input.action === 'status') { if (!input.id) throw new Error('Indica il record immagine'); return host.status(input.id) }
      if (input.action !== 'generate' || !input.prompt?.trim() || (input.count !== undefined && (!Number.isInteger(input.count) || input.count < 1 || input.count > 4))) throw new Error('Indica prompt e quantità da 1 a 4')
      const prior = await host.previous(context.toolCallId); if (prior) return prior
      const choice = await host.choose({ modelId: input.model, prompt: input.prompt, count: input.count || 1 }, context.abortSignal)
      if (!choice) return { cancelled: true }
      allowed()
      if (!(await host.models()).some(model => model.modelId === choice.modelId)) throw new Error('Il modello scelto non è più disponibile')
      return host.generate(choice, context.toolCallId)
    },
  } }
}
