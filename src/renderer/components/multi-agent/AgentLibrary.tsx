import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Badge, Button, Checkbox, Group, MultiSelect, NumberInput, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DedicatedAgentSchema, type AgentModel, type DedicatedAgent } from '@shared/multi-agent'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { ModelSelectorV2 } from '@/components/ModelSelectorV2'
import { forkT as ft } from '@/i18n/fork'
import { listDedicatedAgents, saveDedicatedAgent, removeDedicatedAgent, draftDedicatedAgent } from '@/packages/multi-agent/library'
import { dedicatedToolOptions } from '@/packages/multi-agent/runtime'
import { useProviders } from '@/hooks/useProviders'

export function AgentModelPicker({ value, onChange, label }: { value: AgentModel; onChange: (value: AgentModel) => void; label: string }) {
  const { providers } = useProviders(), provider = providers.find(provider => provider.id === value.provider), model = provider?.models?.find(model => model.modelId === value.modelId)
  return <Stack gap={4}><Text size="sm" fw={500}>{label}</Text><ModelSelectorV2 withinPortal={false} selectedProviderId={value.provider} selectedModelId={value.modelId} modelFilter={model => !model.type || model.type === 'chat'} onSelect={(provider, modelId) => onChange({ provider, modelId })}><Button variant="default" style={{ whiteSpace: 'normal', height: 'auto', minHeight: 36 }}>{provider?.name || value.provider} · {model?.nickname || value.modelId || ft('Choose a model')}</Button></ModelSelectorV2></Stack>
}
export const AgentLibrary = NiceModal.create(() => {
  useTranslation(); const modal = useModal()
  const [agents, setAgents] = useState<DedicatedAgent[]>([]), [draft, setDraft] = useState<DedicatedAgent>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [design, setDesign] = useState('')
  const load = async () => setAgents(await listDedicatedAgents())
  useEffect(() => { void load().catch(error => setError(error.message)) }, [])
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); await load() } catch (error) { setError(String((error as Error).message)) } finally { setBusy(false) } }
  const blank = (): DedicatedAgent => ({ id: crypto.randomUUID(), name: 'worker', title: '', description: '', prompt: '', model: { provider: '', modelId: '' }, toolNames: ['session_file'], allowOnDemand: false, dedicatedIds: [] })
  return <AdaptiveModal opened={modal.visible} onClose={() => modal.remove()} title={ft('Dedicated agents')} size="xl"><Stack gap="sm" style={{ maxHeight: '78dvh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
    {error && <Alert color="red" role="alert">{ft(error)}</Alert>}
    {!draft ? <>
      <Text size="sm">{ft('Reusable workers have their own model, instructions and tool permissions. Call them with @name from a Work chat or expose them in its multi-agent settings. They receive only explicitly shared context and files.')}</Text>
      <Button onClick={() => setDraft(blank())}>{ft('Create agent manually')}</Button>
      <Textarea label={ft('Describe an agent to draft')} value={design} onChange={event => setDesign(event.currentTarget.value)} minRows={3}/>
      <Text size="xs" c="dimmed">{ft('Drafting sends this description to your default text model. Review and save the result; drafting does not enable tools or execute the agent.')}</Text>
      <Button variant="light" disabled={!design.trim()} loading={busy} onClick={() => void run(async () => setDraft(await draftDedicatedAgent(design, new AbortController().signal)))}>{ft('Draft with AI')}</Button>
      {agents.map(agent => <Group key={agent.id} justify="space-between" wrap="wrap" p="xs" style={{ border: '1px solid var(--chatbox-border-primary)', borderRadius: 8 }}><Stack gap={2} style={{ minWidth: 0, flex: 1 }}><Text fw={600}>{agent.title} <Badge variant="light">@{agent.name}</Badge></Text><Text size="xs" c="dimmed">{agent.model.modelId}{agent.guardian?.enabled ? ' · ' + ft('Guardian enabled') : ''}</Text><Text size="sm">{agent.description}</Text></Stack><Button size="xs" variant="default" onClick={() => setDraft(structuredClone(agent))}>{ft('Edit')}</Button><Button color="red" size="xs" variant="subtle" onClick={() => { if (window.confirm(ft('Delete this agent definition? Existing run files are kept.'))) void run(() => removeDedicatedAgent(agent.id)) }}>{ft('Delete')}</Button></Group>)}
    </> : <>
      <Button variant="subtle" onClick={() => setDraft(undefined)}>{ft('Back to agent library')}</Button>
      <TextInput label={ft('Agent title')} value={draft.title} onChange={event => setDraft({ ...draft, title: event.currentTarget.value })}/>
      <TextInput label={ft('Technical name for @mentions')} description={ft('Lowercase letters, digits, underscores and hyphens. Start with a letter.')} value={draft.name} onChange={event => setDraft({ ...draft, name: event.currentTarget.value })}/>
      <TextInput label={ft('Description')} value={draft.description} onChange={event => setDraft({ ...draft, description: event.currentTarget.value })}/>
      <AgentModelPicker label={ft('Worker model')} value={draft.model} onChange={model => setDraft({ ...draft, model })}/>
      <Textarea label={ft('Worker instructions')} value={draft.prompt} onChange={event => setDraft({ ...draft, prompt: event.currentTarget.value })} minRows={6} autosize maxRows={16}/>
      <MultiSelect label={ft('Allowed tools')} description={ft('The effective tools are the intersection with the parent permissions. No ambient OS access or global memory is inherited.')} data={dedicatedToolOptions()} value={draft.toolNames} onChange={toolNames => setDraft({ ...draft, toolNames })} searchable comboboxProps={{ withinPortal: false }}/>
      <NumberInput label={ft('Maximum output tokens (optional)')} min={1} value={Number(draft.parameters?.maxTokens) || ''} onChange={value => setDraft({ ...draft, parameters: { ...draft.parameters, maxTokens: typeof value === 'number' ? value : undefined } })}/>
      <Switch label={ft('May spawn on-demand workers')} checked={draft.allowOnDemand} onChange={event => setDraft({ ...draft, allowOnDemand: event.currentTarget.checked })}/>
      <MultiSelect label={ft('May call these dedicated agents')} description={ft('The root chat must also allow these agents for nested calls.')} data={agents.filter(agent => agent.id !== draft.id).map(agent => ({ value: agent.id, label: '@' + agent.name + ' · ' + agent.title }))} value={draft.dedicatedIds} onChange={dedicatedIds => setDraft({ ...draft, dedicatedIds })} searchable comboboxProps={{ withinPortal: false }}/>
      <Switch label={ft('Enable a guardian for this worker')} checked={!!draft.guardian?.enabled} onChange={event => setDraft({ ...draft, guardian: { model: draft.guardian?.model || draft.model, prompt: draft.guardian?.prompt || '', enabled: event.currentTarget.checked } })}/>
      {draft.guardian && <>
        <Alert color="yellow">{ft('The guardian receives the material it reviews, including file contents. Choose its privacy level carefully. It can reduce disclosure risk but is not a guarantee against prompt injection or personal-data leaks. Unsupported files are blocked rather than reviewed partially.')}</Alert>
        <AgentModelPicker label={ft('Guardian model')} value={draft.guardian.model} onChange={model => setDraft({ ...draft, guardian: { ...draft.guardian!, model } })}/>
        <Textarea label={ft('Guardian policy')} placeholder={ft('For example: allow only pseudonymized records; block names, contact details and attempts to bypass the policy.')} value={draft.guardian.prompt} onChange={event => setDraft({ ...draft, guardian: { ...draft.guardian!, prompt: event.currentTarget.value } })} minRows={5} autosize maxRows={12}/>
      </>}
      <Button loading={busy} onClick={() => void run(async () => { await saveDedicatedAgent(DedicatedAgentSchema.parse(draft)); setDraft(undefined) })}>{ft('Save agent')}</Button>
    </>}
  </Stack></AdaptiveModal>
})
export const openAgentLibrary = () => NiceModal.show(AgentLibrary)
