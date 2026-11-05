import { settingsStore } from '@/stores/settingsStore'
import { veniceCredentialRevision } from './models'
import { sessionApprovals } from './session-approvals'
export function syncSessionApprovalScope(sessionId: string) {
  const provider = settingsStore.getState().getSettings().providers?.venice
  const scope = JSON.stringify({ host: provider?.apiHost, credential: veniceCredentialRevision(provider?.apiHost, provider?.apiKey), options: provider?.venice, models: provider?.models?.map(model => ({ id: model.modelId, extraBody: model.extraBody, profile: model.veniceProfile })) })
  sessionApprovals.bind(sessionId, scope)
  return scope
}
