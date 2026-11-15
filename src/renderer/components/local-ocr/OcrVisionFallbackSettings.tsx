import {Stack,Text} from '@mantine/core'
import type {OcrVisionFallback} from '@shared/virtual-ocr'
import {AdaptiveSelect} from '@/components/AdaptiveSelect'
import {forkT as ft} from '@/i18n/fork'
import {OcrModelSelector} from './OcrModelSelector'

export function OcrVisionFallbackSettings({value,onChange}:{value?:OcrVisionFallback;onChange:(value:OcrVisionFallback|undefined)=>void}){
 const mode=value?.mode||'off'
 return <Stack gap="xs">
  <AdaptiveSelect label={ft('Vision fallback for local OCR')} value={mode} allowDeselect={false} data={[
   {value:'off',label:ft('Off — local OCR only')},
   {value:'empty',label:ft('When local OCR finds no text')},
   {value:'always',label:ft('Always use vision (handwriting or complex pages)')},
  ]} onChange={next=>{if(next==='off')onChange(undefined);else if(next==='empty'||next==='always')onChange({provider:value?.provider||'',model:value?.model||'',mode:next})}}/>
  {mode!=='off'&&<>
   <Text size="xs" c="dimmed">{ft('Images and PDF pages may be sent to the vision provider selected below. This is independent of the chat model. Local OCR does not reliably detect handwriting or confidently wrong text; use Always for those documents. Engine errors and cancellation never trigger an upload.')}</Text>
   <OcrModelSelector visionOnly value={value} onSelect={(provider,model)=>onChange({mode,provider,model})}/>
  </>}
 </Stack>
}
