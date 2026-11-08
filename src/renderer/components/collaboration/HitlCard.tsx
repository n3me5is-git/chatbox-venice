import { Button,Card,Group,NumberInput,Select,Stack,Text,Textarea } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HitlRequest,HitlAnswer } from '@shared/collaboration'
import { UserQuestionForm } from '@/components/agent/UserQuestion'
import { forkT as ft } from '@/i18n/fork'

export function HitlCard({request,answer}:{request:HitlRequest;answer:(value:HitlAnswer)=>Promise<void>}){
  useTranslation();const input=request.input,[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [model,setModel]=useState(input.kind==='image'?input.modelId||input.models[0]?.id||'':''),[prompt,setPrompt]=useState(input.kind==='image'?input.prompt:''),[count,setCount]=useState(input.kind==='image'?input.count:1),[ratio,setRatio]=useState('auto')
  const submit=async(value:HitlAnswer)=>{setBusy(true);try{await answer(value)}catch(error){setError(error instanceof Error?error.message:String(error));setBusy(false)}}
  return <Card withBorder><Stack gap="sm"><Text fw={600}>{ft('Your decision is needed')}</Text><Text size="xs" c="dimmed">{ft('Only the first valid response is accepted. Closing or rejecting stops this action.')}</Text>
    <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
    {input.kind==='questions'?<UserQuestionForm input={input.input} onSubmit={value=>void submit(value)} onCancel={()=>void submit(null)}/>:input.kind==='confirm'?<Stack><Text fw={500}>{ft(input.title)}</Text><Text size="sm" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{input.detail}</Text><Group><Button variant="default" onClick={()=>void submit(false)}>{ft('Reject')}</Button><Button onClick={()=>void submit(true)}>{ft('Approve')}</Button></Group></Stack>:<Stack>
      <Text size="sm">{ft('This generation may incur a cost on the owner’s account.')}</Text>
      <Select label={ft('Image model')} data={input.models.map(model=>({value:model.id,label:model.name}))} value={model} onChange={value=>setModel(value||'')} searchable allowDeselect={false} comboboxProps={{withinPortal:false}}/>
      <Textarea label={ft('Prompt')} value={prompt} onChange={event=>setPrompt(event.currentTarget.value)} autosize minRows={3} maxRows={8}/>
      <NumberInput label={ft('Number of images')} value={count} onChange={value=>setCount(Number(value)||1)} min={1} max={4}/>
      <Select label={ft('Aspect ratio')} value={ratio} onChange={value=>setRatio(value||'auto')} data={['auto','1:1','16:9','9:16','4:3','3:4']} comboboxProps={{withinPortal:false}}/>
      <Group><Button variant="default" onClick={()=>void submit(null)}>{ft('Cancel')}</Button><Button disabled={!model||!prompt.trim()} onClick={()=>void submit({modelId:model,prompt,count,aspectRatio:ratio as 'auto'})}>{ft('Approve generation')}</Button></Group>
    </Stack>}</fieldset>
    {error&&<Text c="red" size="sm">{ft(error)}</Text>}
  </Stack></Card>
}
