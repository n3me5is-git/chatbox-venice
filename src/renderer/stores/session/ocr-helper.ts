import {ocrTransportIssue} from '@shared/ocr-transport'
import {runOcrWithFallback,activeOcrFallback,validateOcrFallback,VIRTUAL_OCR_INSTRUCTION} from '@shared/virtual-ocr'
import {LOCAL_OCR_PROVIDER} from '@shared/local-ocr'
import {PADDLE_OCR_PROVIDER} from '@shared/paddle-ocr'
import {paddleOcrModel} from '@/packages/paddle-ocr/model'
import {localOcrModel} from '@/packages/local-ocr/model'
import { getModel } from '@shared/models'
import type { ModelInterface } from '@shared/models/types'
import type { Message, Settings } from '@shared/types'
import { ModelProviderEnum } from '@shared/types'
import type { ModelDependencies } from '@shared/types/adapters'
import { getModelSettings } from '@shared/utils/model_settings'
import type { ModelMessage } from 'ai'
import pMap from 'p-map'
import { createModelDependencies } from '@/adapters'

/**
 * Resolve the OCR model based on user settings and license key.
 * User-configured OCR model takes priority; Chatbox AI is the fallback.
 * Returns null if no OCR model is available (caller decides how to handle).
 */
export function getOCRModel(
  globalSettings: Settings,
  configs: { uuid: string },
  dependencies: ModelDependencies
): { model: ModelInterface; providerName: string } | null {
  const hasUserOcrModel = !!(globalSettings.ocrModel?.provider && globalSettings.ocrModel?.model)
  const hasLicenseKey = !!globalSettings.licenseKey

  if (!hasUserOcrModel && !hasLicenseKey) {
    return null
  }

  if (hasUserOcrModel) {
    // User has explicitly configured an OCR model — always respect their choice
    const ocrModelSetting = globalSettings.ocrModel!
    const vision=(provider:string,modelId:string)=>{
      const issue=ocrTransportIssue(provider,modelId,globalSettings.providers?.[provider]);if(issue)throw Error(issue)
      const selected=getModelSettings(globalSettings,provider,modelId)
      const model=getModel({...selected,temperature:0,maxTokens:4096,subscriptionWebSearch:false,veniceProfile:{webSearch:'off',webSearchEnabled:false,xSearch:false,webScraping:false}},globalSettings,configs,dependencies)
      if(!model.isSupportVision())throw Error('Choose a vision model for OCR')
      return model
    }
    const primary=ocrModelSetting.provider===PADDLE_OCR_PROVIDER?paddleOcrModel(ocrModelSetting.model):ocrModelSetting.provider===LOCAL_OCR_PROVIDER?localOcrModel(ocrModelSetting.model):vision(ocrModelSetting.provider,ocrModelSetting.model)
    const fallback=activeOcrFallback(ocrModelSetting.provider,globalSettings.ocrVisionFallback)
    validateOcrFallback(ocrModelSetting.provider,fallback)
    const model:ModelInterface=fallback?{...primary,chat:(messages,options)=>runOcrWithFallback(()=>primary.chat(messages,options),()=>vision(fallback.provider,fallback.model).chat(messages,{...options,maxSteps:1,tools:{}}),{provider:ocrModelSetting.provider,fallback,signal:options.signal,text:result=>result.contentParts.filter(p=>p.type==='text').map(p=>p.text).join('')})}:primary
    return {model,providerName:primary.name||ocrModelSetting.provider}
  }

  // Fallback to Chatbox AI built-in OCR model
  const modelSettings = getModelSettings(globalSettings, ModelProviderEnum.ChatboxAI, 'chatbox-ocr-1')
  return {
    model: getModel(modelSettings, globalSettings, configs, dependencies),
    providerName: 'Chatbox AI',
  }
}

/**
 * Run OCR on all image parts in messages that don't yet have an ocrResult.
 * Mutates message contentParts in place (sets `ocrResult` on image parts).
 * Uses p-map with concurrency: 3 for parallel OCR processing.
 */
export async function ocrImagesInMessages(
  messages: Message[],
  ocrModel: ModelInterface,
  sessionId: string,
  signal?:AbortSignal
): Promise<void> {
  signal?.throwIfAborted()
  const imageParts: Array<{ storageKey: string; part: Message['contentParts'][number] & { type: 'image' } }> = []
  for (const msg of messages) {
    for (const part of msg.contentParts) {
      if (part.type === 'image' && !part.ocrResult) {
        imageParts.push({ storageKey: part.storageKey, part })
      }
    }
  }

  if (imageParts.length === 0) return

  const dependencies = await createModelDependencies()

  await pMap(
    imageParts,
    async ({ storageKey, part }) => {
      signal?.throwIfAborted()
      const imageData = await dependencies.storage.getImage(storageKey)
      signal?.throwIfAborted()
      if (!imageData) return

      const ocrMsg: ModelMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: VIRTUAL_OCR_INSTRUCTION,
          },
          { type: 'image' as const, image: imageData },
        ],
      }
      const chatResult = await ocrModel.chat([ocrMsg], { sessionId, maxSteps:1, tools:{},...(signal?{signal}:{}) })
      signal?.throwIfAborted()
      const text = chatResult.contentParts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('')

      part.ocrResult = text
    },
    { concurrency: ocrModel.name==='MiniCPM-OCR · Local'?1:3,...(signal?{signal}:{}) }
  )
}
