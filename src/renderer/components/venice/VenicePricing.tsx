import { Alert, Button, Group, Paper, Stack, Switch, Text, Title } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaCatalogItem, MediaInput } from '@shared/providers/definitions/models/venice/media'
import { modelPriceRows, formatPrice } from '@shared/providers/definitions/models/venice/pricing'
import { supportedValues, friendlyMediaError } from '@shared/providers/definitions/models/venice/catalog'
import { forkT as ft } from '@/i18n/fork'
import { VeniceSettingSelect as Select } from './VeniceSettingSelect'
export function VenicePricing({model,onQuote}:{model:MediaCatalogItem;onQuote:(input:MediaInput)=>Promise<unknown>}){
 const {i18n}=useTranslation(),locale=i18n.resolvedLanguage||i18n.language||'en'
 const rows=modelPriceRows(model),video=model.type==='video',constraints=model.model_spec?.constraints||{}
 const durations=supportedValues(model,'durations').filter(value=>/^\d+(?:\.\d+)?s?$/.test(value))
 const resolutions=supportedValues(model,'resolutions')
 const [duration,setDuration]=useState(durations.find(value=>parseFloat(value)===5)||durations[0]||'')
 const [resolution,setResolution]=useState(resolutions.at(-1)||''),[audio,setAudio]=useState(false)
 const [quote,setQuote]=useState<number>(),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const request=useRef<AbortController|null>(null)
 useEffect(()=>()=>request.current?.abort(),[])
 const clear=()=>{request.current?.abort();request.current=null;setQuote(undefined);setError('');setBusy(false)}
 const load=async()=>{
  const controller=new AbortController();request.current?.abort();request.current=controller;setBusy(true);setError('');setQuote(undefined)
  try{
   const result=await onQuote({kind:'video',model:model.id,prompt:'',options:{duration,...(resolution?{resolution}:{}),...(constraints.audio_configurable?{audio}:{})},signal:controller.signal}) as {quote?:unknown}
   if(controller.signal.aborted)return
   if(typeof result.quote!=='number'||!Number.isFinite(result.quote)||result.quote<0)throw Error('Venice did not return a valid cost')
   setQuote(result.quote)
  }catch(error){if(!controller.signal.aborted)setError(ft(friendlyMediaError(String(error))))}
  finally{if(request.current===controller){request.current=null;setBusy(false)}}
 }
 return <Paper withBorder p="md" radius="md" bg="var(--mantine-color-blue-light)" aria-label={ft('Model pricing')}><Stack gap="sm">
  <Title order={4}>{ft('Pricing')}</Title>
  {rows.map(row=><Paper key={row.id} p="sm" radius="sm" withBorder><Stack gap={3}>
   <Text size="sm" fw={600}>{ft(row.label)}{row.detail?' · '+row.detail:''}</Text>
   {row.threshold!==undefined&&<Text size="xs" c="dimmed">{ft('Above {{tokens}} context tokens',{tokens:new Intl.NumberFormat(locale).format(row.threshold)})}</Text>}
   <Group gap="md" wrap="wrap">{row.usd!==undefined&&<Text size="lg" fw={700}>{formatPrice(row.usd,'USD',locale)}</Text>}{row.diem!==undefined&&<Text size="sm">{formatPrice(row.diem,'DIEM',locale)}</Text>}</Group>
   {row.divisor&&<Text size="xs" c="dimmed">{ft(row.singleUnit!)}: {[row.usd===undefined?'':formatPrice(row.usd/row.divisor,'USD',locale),row.diem===undefined?'':formatPrice(row.diem/row.divisor,'DIEM',locale)].filter(Boolean).join(' · ')}</Text>}
  </Stack></Paper>)}
  {!rows.length&&<Text size="sm">{ft(video?'Video pricing depends on duration, resolution and input media. Request an estimate below.':'The provider has not supplied a price for this model. A missing price does not mean free.')}</Text>}
  {video&&<>
   {durations.length>0?<Select label={ft('Duration for estimate')} data={durations.map(value=>({value,label:parseFloat(value)+' s'}))} value={duration} allowDeselect={false} onChange={value=>{clear();setDuration(value||'')}}/>:<Text size="sm">{ft('This model needs source media for an exact estimate. Use Show cost in Venice Studio.')}</Text>}
   {resolutions.length>0&&<Select label={ft('Resolution for estimate')} data={resolutions} value={resolution} allowDeselect={false} onChange={value=>{clear();setResolution(value||'')}}/>}
   {constraints.audio_configurable===true&&<Switch label={ft('Include generated audio')} checked={audio} onChange={event=>{clear();setAudio(event.currentTarget.checked)}}/>}
   <Button variant="light" loading={busy} disabled={!duration} onClick={()=>void load()}>{ft('Get current price estimate')}</Button>
   <Text size="xs" c="dimmed">{ft('Requests a price only. It does not generate content. Estimates apply to the selected settings.')}</Text>
   {quote!==undefined&&<Paper p="sm" withBorder radius="sm" role="status"><Text size="lg" fw={700}>{formatPrice(quote,'USD',locale)} · {parseFloat(duration)} s</Text><Text size="sm">{ft('Average per output second')}: {formatPrice(quote/parseFloat(duration),'USD',locale)}</Text></Paper>}
  </>}
  {error&&<Alert color="orange">{error}</Alert>}
  <Text size="xs" c="dimmed">{ft('Catalog rates may change. Duration tiers and quality options are separate prices, not a linear per-second rate.')}</Text>
 </Stack></Paper>
}
