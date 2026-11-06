import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { Accordion, Alert, Button, Group, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'
import { VeniceProfileSchema } from '@shared/types/settings'
import type { VeniceOptions, VeniceProfile } from '@shared/providers/definitions/models/venice/options'
import { mergeExtraBody, parseExtraBody } from '@shared/models/utils/extra-body'
import { useProviderSettings } from '@/stores/settingsStore'

export function VeniceProfileEditor({ options, value, onChange, allowPreset = true }: { options: VeniceOptions; value: VeniceProfile; onChange: (value: VeniceProfile) => void; allowPreset?: boolean }) {
  useTranslation()
  const set = (update: Partial<VeniceProfile>) => onChange({ ...value, ...update })
  return <Stack gap="sm">
    {allowPreset && <><Text fw={600}>{ft("Customize Venice")}</Text><Text size="xs" c="dimmed">{ft("Choose a profile or customize individual options. Empty fields use general settings.")}</Text>
      <Select comboboxProps={{ withinPortal: false }} label={ft("Saved profile")} clearable placeholder={ft("General settings")} value={value.profileId || null} data={(options.profiles || []).map(p => ({ value: p.id, label: p.name }))} onChange={id => set({ profileId: id || undefined })} /></>}
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Select comboboxProps={{ withinPortal: false }} label={ft("When to search the web")} clearable placeholder={ft("General settings")} value={value.webSearch || null} data={[{ value: 'off', label: ft("Do not search") }, { value: 'auto', label: ft("When needed") }, { value: 'on', label: ft("For every message") }]} onChange={mode => set({ webSearch: mode as VeniceProfile['webSearch'] || undefined })} />
      <Select comboboxProps={{ withinPortal: false }} label={ft("Search engine")} clearable placeholder={ft("General settings")} value={value.searchProvider || null} data={[{ value: 'native', label: 'Venice' }, { value: 'brave', label: 'Brave' }, { value: 'google', label: 'Google' }, { value: 'exa', label: 'Exa' }]} onChange={engine => set({ searchProvider: engine as VeniceProfile['searchProvider'] || undefined })} />
      <Select comboboxProps={{withinPortal:false}} label={ft('Search tools')} clearable placeholder={ft('General settings')} value={value.searchToolMode||null} data={[{value:'selected',label:ft('Selected engine')},{value:'separate',label:ft('Separate Brave, Google and Exa tools')}]} onChange={mode=>set({searchToolMode:mode as VeniceProfile['searchToolMode']||undefined})}/>
      <Select comboboxProps={{ withinPortal: false }} label={ft("Image content filter")} clearable placeholder={ft("General settings")} value={value.imageSafeMode === undefined ? null : String(value.imageSafeMode)} data={[{ value: 'true', label: ft("On") }, { value: 'false', label: ft("Off") }]} onChange={mode => set({ imageSafeMode: mode === null ? undefined : mode === 'true' })} />
      <Select comboboxProps={{ withinPortal: false }} label={ft("Answer sources")} clearable placeholder={ft("General settings")} value={value.webCitations === undefined ? null : String(value.webCitations)} data={[{ value: 'true', label: ft("Show source links") }, { value: 'false', label: ft("Hide sources") }]} onChange={mode => set({ webCitations: mode === null ? undefined : mode === 'true' })} />
    </SimpleGrid>
    {allowPreset && <Button size="xs" variant="subtle" onClick={() => onChange({})}>{ft("Reset to general settings")}</Button>}
  </Stack>
}

export function VeniceProfiles() {
  useTranslation()
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const [name, setName] = useState(''); const [form, setForm] = useState<VeniceProfile>({}); const [json, setJson] = useState(''); const [id, setId] = useState<string | null>(null); const [error, setError] = useState('')
  const save = () => {
    try {
      if (!name.trim()) throw new Error(ft("Name the profile to save it."))
      const profile = VeniceProfileSchema.strict().parse(mergeExtraBody(form, parseExtraBody(json) || {}))
      const profileId = id || crypto.randomUUID()
      setProviderSettings({ venice: { ...options, profiles: [...(options.profiles || []).filter(p => p.id !== profileId), { id: profileId, name: name.trim(), options: profile }] } })
      setId(profileId); setError('')
    } catch { setError(ft("Check the name and advanced options: the profile was not saved.")) }
  }
  return <Accordion variant="contained" radius="md"><Accordion.Item value="profiles"><Accordion.Control>{ft("Your profiles")}</Accordion.Control><Accordion.Panel><Stack gap="sm">
    <Text size="sm" c="dimmed">{ft("Save combinations you use often, such as Deep research or Chat without web. Select them for any model or chat.")}</Text>
    <Select comboboxProps={{ withinPortal: false }} label={ft("Edit profile")} clearable placeholder={ft("Create a new profile")} value={id} data={(options.profiles || []).map(p => ({ value: p.id, label: p.name }))} onChange={value => { setId(value); const profile = options.profiles?.find(p => p.id === value); setName(profile?.name || ''); setForm(profile?.options || {}); setJson(''); setError('') }} />
    <TextInput label={ft("Profile name")} placeholder={ft("For example: Deep research")} value={name} onChange={e => setName(e.currentTarget.value)} />
    <VeniceProfileEditor options={options} value={form} onChange={setForm} allowPreset={false} />
    <Accordion variant="default"><Accordion.Item value="advanced"><Accordion.Control>{ft("Advanced profile options")}</Accordion.Control><Accordion.Panel><Textarea label={ft("Profile options JSON")} description={ft("Optional. These values override the choices above.")} placeholder={'{"image":{"seed":42}}'} autosize minRows={3} value={json} onChange={e => setJson(e.currentTarget.value)} /></Accordion.Panel></Accordion.Item></Accordion>
    {error && <Alert color="red" role="alert">{error}</Alert>}
    <Group><Button variant="default" onClick={save}>{ft("Save profile")}</Button>{id && <Button color="red" variant="subtle" onClick={() => { setProviderSettings({ venice: { ...options, profiles: options.profiles?.filter(p => p.id !== id) } }); setId(null); setName(''); setForm({}); setJson('') }}>{ft("Delete profile")}</Button>}</Group>
  </Stack></Accordion.Panel></Accordion.Item></Accordion>
}
