import { useEffect } from 'react'
import { acceptsImageReferences, canAutoSelectReferenceModel, referenceImageModel, type ReferenceImageOption } from '@shared/providers/definitions/models/venice/image-reference-model'

export function useReferenceModelSelection<T extends ReferenceImageOption>({models,selectedId,count,automatic,onSelect}:{models:readonly T[];selectedId:string;count:number;automatic:boolean;onSelect:(id:string)=>void}) {
  const selected=models.find(model=>model.modelId===selectedId)
  const candidate=count>0?referenceImageModel(models,selectedId,count):undefined
  const change=candidate&&candidate.modelId!==selectedId?candidate:undefined
  const samePrivacy=canAutoSelectReferenceModel(selected,change)
  useEffect(()=>{
    if(automatic&&samePrivacy&&change)onSelect(change.modelId)
  },[automatic,samePrivacy,change?.modelId,onSelect])
  return {candidate:change,privacyChange:!!change&&!samePrivacy,compatible:count===0||acceptsImageReferences(selected,count)}
}
