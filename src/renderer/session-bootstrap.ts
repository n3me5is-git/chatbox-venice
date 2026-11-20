import { registerSessionUiEffects } from '@/presentation/session/session-ui-effects'
import { rendererApplication } from '@/app/renderer-application'
import { initializeChatRetention } from '@/packages/chat-retention/retention'

let cleanup: (() => void) | null = null

/**
 * Renderer composition entry for Presentation-only session effects.
 *
 * Keeping this out of the application graph prevents Presentation effects
 * from pulling React components back into the application/data dependency path.
 */
export async function initSessionPresentationBindings(): Promise<void> {
  if (!cleanup) {
    cleanup = registerSessionUiEffects(rendererApplication.sessionEvents)
  }
  await initializeChatRetention()
}
