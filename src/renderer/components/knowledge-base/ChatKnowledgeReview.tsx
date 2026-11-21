import { Alert, Button, Checkbox, Group, NativeSelect, Stack, Switch, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionSettings } from '@shared/types'
import { KnowledgeFollowUpLimitSchema, KnowledgeVerificationSettingsSchema } from '@shared/knowledge-verification'
import { ModelSelectorV2 } from '@/components/ModelSelectorV2'
import { useSettingsStore } from '@/stores/settingsStore'
import { forkT as ft } from '@/i18n/fork'

export function ChatKnowledgeReview({ value, onChange }: {
 value: SessionSettings['knowledgeVerification']
 onChange: (value: SessionSettings['knowledgeVerification']) => void
}) {
 useTranslation()
 const global = useSettingsStore(state => state.defaultKnowledgeVerifierModel)
 const [open, setOpen] = useState(false)
 const [ref, setRef] = useState(value?.model ?? global)
 const [consent, setConsent] = useState(false)
 const [correct, setCorrect] = useState(value?.correctConflicts ?? true)
 const [concise, setConcise] = useState(value?.reasoning !== 'auto')
 const [followUpSearches, setFollowUpSearches] = useState(value?.followUpSearches ?? 0)
 const configure = () => {
  setRef(value?.model ?? global)
  setCorrect(value?.correctConflicts ?? true)
  setConcise(value?.reasoning !== 'auto')
  setFollowUpSearches(value?.followUpSearches ?? 0)
  setConsent(false)
  setOpen(true)
 }
 const save = () => {
  onChange(KnowledgeVerificationSettingsSchema.parse({
   enabled:true,model:ref,consented:true,correctConflicts:correct,reasoning:concise?'concise':'auto',
   ...(followUpSearches ? { followUpSearches } : {}),
  }))
  setOpen(false)
 }

 return <Stack gap="xs">
  <Switch label={ft('Check answers against sources')} checked={value?.enabled===true} onChange={event=>{
   if(event.currentTarget.checked)configure()
   else onChange(value?{...value,enabled:false}:undefined)
  }}/>
  <Text size="xs" c="dimmed">{ft('When enabled, the answer appears after a separate source review. Tool progress and approvals remain available.')}</Text>
  {value?.enabled && <Group>
   <Text size="xs">{ft('Review model')}: {value.model?.model}</Text>
   <Button size="xs" variant="subtle" onClick={configure}>{ft('Configure review')}</Button>
  </Group>}
  {open && <Stack gap="xs">
   <ModelSelectorV2 withinPortal={false} selectedProviderId={ref?.provider} selectedModelId={ref?.model}
    modelFilter={model=>!model.type||model.type==='chat'} onSelect={(provider,model)=>{setRef({provider,model});setConsent(false)}}>
    <Button variant="default" style={{height:'auto',minHeight:44,whiteSpace:'normal'}}>{ref?.model||ft('Choose a knowledge verifier')}</Button>
   </ModelSelectorV2>
   <Alert color="yellow">{ft('The verifier receives the draft and any retrieved excerpts. Its privacy may differ from the chat model. Additional evidence can increase review time and model charges.')}</Alert>
   <Switch label={ft('Use concise source review')} description={ft('Uses the lowest supported thinking mode to leave room for the verification result. Turn off to use the model’s default reasoning.')}
    checked={concise} onChange={event=>{setConcise(event.currentTarget.checked);setConsent(false)}}/>
   <Switch label={ft('Correct conflicting claims once')} checked={correct} onChange={event=>{setCorrect(event.currentTarget.checked);setConsent(false)}}/>
   <NativeSelect label={ft('Maximum extra source searches')}
    description={ft('Searches the local indexes of collections already cited in the answer. New excerpts may be sent to the verifier.')}
    value={String(followUpSearches)}
    data={[{value:'0',label:ft('0 · Off')},{value:'1',label:'1'},{value:'2',label:'2'}]}
    onChange={event=>{setFollowUpSearches(KnowledgeFollowUpLimitSchema.parse(Number(event.currentTarget.value)));setConsent(false)}}/>
   <Checkbox label={ft('I allow this verifier to process the answer and source excerpts')} checked={consent} onChange={event=>setConsent(event.currentTarget.checked)}/>
   <Group>
    <Button disabled={!consent||!ref} onClick={save}>{ft('Enable source review')}</Button>
    <Button variant="subtle" onClick={()=>setOpen(false)}>{ft('Cancel')}</Button>
   </Group>
  </Stack>}
 </Stack>
}
