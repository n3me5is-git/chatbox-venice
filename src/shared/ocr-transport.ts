import type {ProviderModelInfo,ProviderSettings} from './types'
import {effectiveTextPrivacy} from './providers/definitions/models/venice/privacy'

export const ENCRYPTED_OCR_UNAVAILABLE='This model supports Vision, but its E2EE transport currently accepts text only. Choose a Private Vision model or local OCR for image processing. The chat can still use E2EE with the extracted text.'
/** A model's advertised Vision capability is separate from its active transport. */
export function ocrTransportIssue(provider:string|undefined,modelId:string|undefined,saved?:ProviderSettings,info?:ProviderModelInfo){
 if(provider!=='venice'||!modelId)return undefined
 const model=info||[...(saved?.catalogModels||[]),...(saved?.models||[])].find(model=>model.modelId===modelId)
 const metadata=model?.vendorMetadata||{capabilities:{supportsE2EE:modelId.startsWith('e2ee-')}}
 return effectiveTextPrivacy(saved?.venice,metadata)==='e2ee'?ENCRYPTED_OCR_UNAVAILABLE:undefined
}
