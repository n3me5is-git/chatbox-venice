import {
  BasicGenerationPreparation,
  type BasicGenerationToolPreparation,
  type GenerationPreparationRequest,
} from '@chatbox/core/generation'
import { throwIfWorkAborted } from '@shared/mobile-work/abort'
import { LocalWorkMode, WORK_INSTRUCTIONS } from '@shared/mobile-work/LocalWorkMode'
import { workModelDisclosure } from '@shared/mobile-work/model-disclosure'
import { buildLocalViewImage } from '@shared/mobile-work/view-image'
import { workspaceInputPath } from '@shared/mobile-work/workspace-inputs'
import type { ModelInterface } from '@shared/models/types'
import { supportsToolResultImages } from '@shared/tools/view-image'
import type { ModelDependencies } from '@shared/types/adapters'
import type { ToolSet } from 'ai'
import { currentBlobStorage } from '@/adapters/CurrentBlobStorage'
import { rendererApplication } from '@/app/renderer-application'
import { prepareMobileMCPTools } from '@/packages/mcp/mobile-tools'
import { parseLinkTool, buildWebSearchTools } from '@/packages/model-calls/toolsets/web-search'
import { PROVIDERS_WITH_PARSE_LINK } from '@/packages/web-search'
import platform from '@/platform'
import * as settingActions from '@/stores/settingActions'
import { settingsStore } from '@/stores/settingsStore'
import { CapacitorWorkspace } from './CapacitorWorkspace'
import { createCapacitorSystemToolGroups } from './capacitor-system-tools'
import { capacitorDocumentParser } from './document-parser'
import { capacitorExecution } from './execution-service'
import { normalizeWorkImage } from './normalize-work-image'

export const capacitorWorkspace = new CapacitorWorkspace()
export const capacitorWorkMode = new LocalWorkMode(
  capacitorWorkspace,
  capacitorExecution,
  (context) =>
    createCapacitorSystemToolGroups({
      sessionId: context.sessionId,
      providerLabel: context.modelName,
      providerIdentity: context.modelIdentity,
      signal: context.signal,
      workspace: capacitorWorkspace,
    }),
  currentBlobStorage,
  () => ({
    getSettings: () => settingsStore.getState().getSettings(),
    refreshAccount: async () => {
      const { refreshChatboxAccount } = await import('@/packages/chatbox-cli/account')
      return Boolean((await refreshChatboxAccount()).refreshed)
    },
    getVersion: async () => ({ installedVersion: await platform.getVersion(), platform: await platform.getPlatform() }),
    listChats: (cursor, limit, archived) =>
      archived
        ? rendererApplication.sessions.listArchivedSessionsMetaPage(cursor, limit)
        : rendererApplication.sessions.listSessionsMetaPage(cursor, limit),
    readChatPage: (request) => rendererApplication.sessions.readSessionTranscriptWindow(request),
  }),
  capacitorDocumentParser
)

export function buildMobileWebTools(model: ModelInterface, enabled: boolean) {
  const tools: ToolSet = {}
  if (model.usesNativeWebSearch || !enabled || !model.isSupportToolUse('web-browsing')) return { tools }
  const includeParseLink = PROVIDERS_WITH_PARSE_LINK.has(settingActions.getExtensionSettings().webSearch.provider)
  Object.assign(tools, buildWebSearchTools())
  if (includeParseLink) tools.parse_link = parseLinkTool
  return { tools }
}

export function capacitorImageTools(model: ModelInterface, sessionId: string, signal: AbortSignal) {
  return model.isSupportVision()
    ? buildLocalViewImage({
        workspace: capacitorWorkspace,
        blobs: currentBlobStorage,
        sessionId,
        signal,
        normalize: normalizeWorkImage,
        toolResultImages: supportsToolResultImages(model.apiStyle),
      })
    : undefined
}

type CapacitorToolRequest = Pick<GenerationPreparationRequest<ModelDependencies>, 'settings'|'globalSettings'|'model'|'signal'|'webBrowsing'> & {sessionId:string;messages:import('@shared/types').Message[]}

export async function prepareCapacitorSessionTools(request:CapacitorToolRequest,memoryTools:ToolSet={},restoreActive=false){
  throwIfWorkAborted(request.signal)
  const mcp = await prepareMobileMCPTools({
    enabled: true,
    model: request.model,
    settings: request.globalSettings,
    signal: request.signal,
  })
  const web = buildMobileWebTools(request.model, request.webBrowsing)
  const images = capacitorImageTools(request.model, request.sessionId, request.signal)
  const local = await capacitorWorkMode.createTools(
    {
      sessionId: request.sessionId,
      capabilities: request.settings.localWorkCapabilities,
      skillPreferences: request.globalSettings.mobileSkillPreferences,
      ...workModelDisclosure(request.settings, request.globalSettings),
      signal: request.signal,
    },
    { ...web.tools, ...images?.tools, ...memoryTools, ...mcp.tools },
    restoreActive
  )
  const sessionImages = request.model.isSupportVision()
    ? (await import('@/packages/model-calls/toolsets/view-image')).buildViewImageToolSet({sessionId:request.sessionId,toolResultImages:supportsToolResultImages(request.model.apiStyle)})
    : undefined
  const { extendSessionWorkTools, guardSharedSessionTools } = await import('@/packages/model-calls/session-work-tools')
  const common = await extendSessionWorkTools({sessionId:request.sessionId,settings:request.settings,messages:request.messages,globalSettings:request.globalSettings,baseTools:Object.fromEntries(Object.entries(local.tools).filter(([name])=>local.active.has(name))),imageResults:sessionImages?.imageResults})
  for(const name of Object.keys(common.tools))local.active.add(name)
  Object.assign(local.tools,common.tools)
  const tools=guardSharedSessionTools(request.sessionId,request.messages,local.tools)
  const active=local.active
  return {tools,active,instructions:common.instructions,unavailable:mcp.unavailable,prepareStepMessages:async(messages:import('ai').ModelMessage[])=>{
    let prepared=images?await images.prepareStepMessages(messages):messages
    if(sessionImages?.injectImagesIntoStepMessages)prepared=await sessionImages.injectImagesIntoStepMessages(prepared)
    return prepared
  }}
}

export async function prepareCapacitorWorkMode(
  request: GenerationPreparationRequest<ModelDependencies>,
  memory: BasicGenerationToolPreparation
) {
  throwIfWorkAborted(request.signal)
  await capacitorWorkspace.seed(
    request.session.id,
    request.messages.slice(0, request.targetMessageIndex),
    currentBlobStorage
  )
  throwIfWorkAborted(request.signal)
  const common=await prepareCapacitorSessionTools({...request,sessionId:request.session.id,messages:request.messages.slice(0,request.targetMessageIndex)},memory.tools)
  const {tools,active}=common
  const prepared = await new BasicGenerationPreparation<ModelDependencies>({
    attachmentPolicy: { workspacePath: workspaceInputPath },
    prepareTools: async () => ({
      ...memory,
      tools,
      instructions: `${memory.instructions ?? ''}${WORK_INSTRUCTIONS}${common.instructions}${common.unavailable.length ? '\nSome enabled MCP services are unavailable. Do not claim to have used their tools.' : ''}`,
    }),
  }).prepare(request)
  return {
    ...prepared,
    chatOptions: {
      ...prepared.chatOptions,
      agentMode: true,
      prepareStep: async ({ messages }: { messages: import('ai').ModelMessage[] }) => {
        return {activeTools:[...active],messages:await common.prepareStepMessages(messages)}
      },
    },
  }
}
