import { Accordion, Alert, Select, Stack, Textarea } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { MediaCatalogItem, MediaKind } from '@shared/providers/definitions/models/venice/media'
import { speechSupportsStylePrompt, videoSupportsNegativePrompt } from '@shared/providers/definitions/models/venice/studio-capabilities'
import { parseExtraBody } from '@shared/models/utils/extra-body'
import { forkT as ft } from '@/i18n/fork'

/** All fields edit the same per-call JSON, so approval cannot lose advanced values. */
export function MediaCallParameters({model,kind,value,onChange}:{model?:MediaCatalogItem;kind?:MediaKind;value:string;onChange:(value:string)=>void}) {
  useTranslation()
  let options:Record<string,unknown>={},invalid=false
  try{options=parseExtraBody(value)||{}}catch{invalid=true}
  const field=(name:string,content:unknown)=>{const next={...options};if(content===''||content===undefined)delete next[name];else next[name]=content;onChange(JSON.stringify(next,null,2))}
  const text=(name:string)=>typeof options[name]==='string'?options[name] as string:''
  const voices=Array.isArray(model?.model_spec?.voices)?model.model_spec.voices:[]
  return <Stack gap="sm">
    {kind==='video'&&videoSupportsNegativePrompt(model)&&<details open={!!text('negative_prompt')}><summary>{ft('Negative prompt')}</summary><Textarea label={ft('Elements to avoid')} value={text('negative_prompt')} disabled={invalid} onChange={event=>field('negative_prompt',event.currentTarget.value)} autosize minRows={2}/></details>}
    {kind==='speech'&&speechSupportsStylePrompt(model)&&<Textarea label={ft('Voice style instructions')} value={text('prompt')} disabled={invalid} onChange={event=>field('prompt',event.currentTarget.value)} maxLength={500} autosize minRows={2}/>}
    {(kind==='music'||kind==='sound-effects')&&model?.model_spec?.supports_lyrics===true&&<Textarea label={ft('Lyrics (optional)')} value={text('lyrics')} disabled={invalid} onChange={event=>field('lyrics',event.currentTarget.value)} autosize minRows={2}/>}
    {!!voices.length&&<Select comboboxProps={{withinPortal:false}} searchable clearable label={ft('Voice to use')} value={text('voice')||null} disabled={invalid} data={voices.map(voice=>({value:voice,label:voice}))} onChange={voice=>field('voice',voice||undefined)}/>}
    <Accordion defaultValue={Object.keys(options).length?'parameters':null}><Accordion.Item value="parameters"><Accordion.Control>{ft('Parameters for this call')}</Accordion.Control><Accordion.Panel><Textarea label={ft('Extra parameters for this call (JSON)')} description={ft('All compatible vendor options can be entered here. The selected model validates them before generation.')} value={value} onChange={event=>onChange(event.currentTarget.value)} autosize minRows={4}/></Accordion.Panel></Accordion.Item></Accordion>
    {invalid&&<Alert color="orange">{ft('Enter a valid JSON object before approving this generation.')}</Alert>}
  </Stack>
}
