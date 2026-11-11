import type { ImageModelOption } from '@/packages/image-model-catalog'
import type { ImageChoice, ImageRequest } from '@shared/providers/definitions/models/venice/image-tools'
import { mergeExtraBody } from '@shared/models/utils/extra-body'
import { resolveRequestedVeniceImageModel } from './image-model-choice'
import { imageApprovalDescriptor, sessionApprovals, type ApprovalMode } from './session-approvals'
type Request = ImageRequest
export async function requestSessionImageChoice(sessionId: string, request: Request, models: ImageModelOption[], choose: (request: Request & { message?: string }) => Promise<(ImageChoice & { approvalMode?: ApprovalMode }) | null>, policy = sessionApprovals): Promise<{ choice: ImageChoice; automatic: boolean } | null> {
  const resolved = resolveRequestedVeniceImageModel(models, request.modelId, request.prompt)
  const template = policy.image(sessionId)
  const id = resolved.modelId || (!resolved.requiresChoice ? template?.modelId : undefined)
  const model = models.find(model => model.modelId === id)
  if (model && !model.capabilities?.inputReferences?.min) {
    const choice: ImageChoice = { modelId: model.modelId, prompt: request.prompt, aspectRatio: 'auto', referenceImages: [], ...(template?.modelId === model.modelId ? template : {}), ...(request.aspectRatio?{aspectRatio:request.aspectRatio}:{}), ...(request.extraBody?{extraBody:mergeExtraBody(template?.modelId===model.modelId?template.extraBody||{}:{},request.extraBody)}:{}), count: request.count }
    if (policy.allows(sessionId, imageApprovalDescriptor(choice))) return { choice, automatic: true }
  }
  const revision = policy.revision(sessionId)
  const approved = await choose({ ...request, modelId: resolved.modelId, message: resolved.message })
  if (!approved) return null
  const { approvalMode, ...choice } = approved
  if (revision === policy.revision(sessionId)) {
    if (approvalMode && approvalMode !== policy.mode(sessionId)) policy.setMode(sessionId, approvalMode)
    policy.rememberImage(sessionId, choice)
    if (!choice.referenceImages.length) policy.remember(sessionId, imageApprovalDescriptor(choice))
  }
  return { choice, automatic: false }
}
