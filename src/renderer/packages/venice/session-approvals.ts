import type { ImageChoice } from '@shared/providers/definitions/models/venice/image-tools'
export type ApprovalMode = 'ask' | 'similar' | 'automatic'
export interface GenerationApproval { tool: string; kind: string; model: string; options?: unknown }
type Template = Omit<ImageChoice, 'prompt' | 'referenceImages'>
interface SessionApproval { mode: ApprovalMode; scope: string; grants: Set<string>; image?: Template; revision: number }
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))) : item)
export function createSessionApprovals() {
  const sessions = new Map<string, SessionApproval>(); const listeners = new Set<() => void>(); let version = 0
  const changed = () => { version++; listeners.forEach(listener => listener()) }
  const state = (id: string) => { let value = sessions.get(id); if (!value) { value = { mode: 'ask', scope: '', grants: new Set(), revision: 0 }; sessions.set(id, value) }; return value }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    snapshot: () => version,
    mode: (id: string): ApprovalMode => sessions.get(id)?.mode || 'ask',
    revision: (id: string) => state(id).revision,
    bind(id: string, scope: string) { const value = state(id); if (value.scope !== scope) { sessions.set(id, { mode: 'ask', scope, grants: new Set(), revision: value.revision + 1 }); changed() } },
    setMode(id: string, mode: ApprovalMode) { const value = state(id); value.mode = mode; value.revision++; if (mode === 'ask') { value.grants.clear(); delete value.image }; changed() },
    clear(id: string) { const value = state(id); sessions.set(id, { mode: 'ask', scope: value.scope, grants: new Set(), revision: value.revision + 1 }); changed() },
    clearAll() { sessions.clear(); changed() },
    allows(id: string, request: GenerationApproval) { const value = state(id); return value.mode === 'automatic' || (value.mode === 'similar' && value.grants.has(canonical(request))) },
    remember(id: string, request: GenerationApproval, expectedRevision?: number) { const value = state(id); if (expectedRevision !== undefined && value.revision !== expectedRevision) return; if (value.mode === 'similar') { value.grants.add(canonical(request)); changed() } },
    image(id: string): Template | undefined { const value = state(id).image; return value ? structuredClone(value) : undefined },
    rememberImage(id: string, choice: ImageChoice) { const value = state(id); if (!choice.referenceImages.length) { const { prompt: _prompt, referenceImages: _references, ...template } = choice; value.image = structuredClone(template); changed() } },
  }
}
export const sessionApprovals = createSessionApprovals()
export const imageApprovalDescriptor = (choice: Omit<ImageChoice, 'prompt' | 'referenceImages'>): GenerationApproval => ({ tool: 'venice_image', kind: 'image', model: choice.modelId, options: { count: choice.count, aspectRatio: choice.aspectRatio, extraBody: choice.extraBody || {} } })
