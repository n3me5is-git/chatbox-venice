import {Alert,Badge,Button,Card,Group,Progress,Stack,Text} from '@mantine/core'
import {useEffect,useState} from 'react'
import type {IndexJobProgress,IndexStage} from '@shared/knowledge-index-progress'
import type {ProviderSettings} from '@shared/types'
import {modelPriceRows} from '@shared/providers/definitions/models/venice/pricing'
import {forkT as ft} from '@/i18n/fork'

export const indexStageLabel:Record<IndexStage,string>={queue:'Waiting for a request slot',queued:'Waiting to start',reading:'Reading and checking source',extracting:'Extracting text locally',ocr:'Recognizing page text',transcribing:'Transcribing audio',chunking:'Preparing passages',embedding:'Creating embeddings',analyzing:'Extracting relations and metadata',saving:'Saving index','vectors-ready':'Embeddings ready',reused:'Reused without new model calls',done:'Indexed',failed:'Indexing failed',cancelled:'Indexing stopped',usage:'Processing'}
export function indexCost(job:IndexJobProgress,providers:Record<string,ProviderSettings>|undefined){
 let usd=0,diem=0,priced=false,partial=false
 for(const usage of Object.values(job.usage)){const saved=providers?.[usage.provider],info=[...(saved?.catalogModels||[]),...(saved?.models||[])].find(model=>model.modelId===usage.model),rows=modelPriceRows({id:usage.model,type:'text',model_spec:info?.vendorMetadata}),input=rows.find(row=>row.id==='input'),output=rows.find(row=>row.id==='output'),tokens=usage.inputTokens+usage.estimatedInputTokens
  if(input?.usd!==undefined&&(output?.usd!==undefined||!usage.outputTokens)){usd+=(tokens*input.usd+usage.outputTokens*(output?.usd||0))/1e6;priced=true}else partial=true
  if(input?.diem!==undefined&&(output?.diem!==undefined||!usage.outputTokens))diem+=(tokens*input.diem+usage.outputTokens*(output?.diem||0))/1e6
  if(usage.unreportedCalls)partial=true
 }
 return {usd,diem,priced,partial}
}
export function IndexingStatus({job,providers,fileName,onCancel}:{job:IndexJobProgress;providers?:Record<string,ProviderSettings>;fileName?:string;onCancel:()=>void}){
 const [now,setNow]=useState(Date.now),active=!['done','failed','cancelled'].includes(job.stage)
 useEffect(()=>{if(!active)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[active])
 const total=job.totalFiles,ready=job.readyFiles,current=job.path?job.files[job.path]:undefined,cost=indexCost(job,providers),calls=Object.values(job.usage).reduce((sum,row)=>sum+row.calls,0)
 return <Card withBorder radius="md" data-testid="indexing-status"><Stack gap="sm">
  <Group justify="space-between"><Text fw={600}>{ft(indexStageLabel[job.stage])}</Text><Badge variant="light">{Math.round(((active?now:job.updated)-job.started)/1000)} s</Badge></Group>
  {job.path&&<Text size="sm" style={{overflowWrap:'anywhere'}}>{fileName||job.path}</Text>}
  <Text size="sm">{ft('Documents with embeddings')}: {ready} / {total}{current?.page?' · '+ft('Page')+' '+current.page+(current.pages?' / '+current.pages:''):''}{current?.batch?' · '+ft('Batch')+' '+current.batch+(current.batches?' / '+current.batches:''):''}</Text>
  {active&&job.requestLimit!==undefined&&<Text size="xs">{ft('Active model requests')}: {job.activeRequests||0} / {job.requestLimit} · {ft('Queued requests')}: {job.queuedRequests||0}</Text>}
  <Progress value={job.stage==='done'?100:total?100*ready/total:0} animated={active}/>
  {job.stage==='analyzing'&&<Text size="xs" c="dimmed">{ft('Embeddings are ready. The optional knowledge model is extracting summaries and relations; this adds model calls.')}</Text>}
  <details><summary>{ft('Model usage and estimated cost')}</summary><Stack gap="xs" mt="xs">
   <Text size="sm">{ft('Completed model calls')}: {calls}</Text>
   {Object.values(job.usage).map(row=><Text size="xs" key={row.provider+':'+row.model} style={{overflowWrap:'anywhere'}}>{row.provider} · {row.model}: {row.inputTokens} {ft('input tokens')} + {row.outputTokens} {ft('output tokens')}{row.estimatedInputTokens?' · ~'+row.estimatedInputTokens+' '+ft('estimated input tokens'):''}{row.unreportedCalls?' · '+ft('Usage not fully reported'):''}</Text>)}
   <Text size="sm">{ft('Estimated tracked cost')}: {cost.priced&&(cost.usd>0||!cost.partial)?'$'+cost.usd.toFixed(6)+(cost.diem?' · '+cost.diem.toFixed(6)+' DIEM':''):ft('Unavailable')}{cost.partial?' · '+ft('Partial estimate'):''}</Text>
   <Text size="xs" c="dimmed">{ft('Estimates use saved catalog prices and reported tokens when available. Pending requests, unreported usage and account billing may differ. Missing prices do not mean free.')}</Text>
  </Stack></details>
  {job.error&&<Alert color="red" role="alert">{ft(job.error)}</Alert>}
  {active&&<Button variant="light" color="red" onClick={onCancel}>{ft('Stop indexing')}</Button>}
 </Stack></Card>
}
