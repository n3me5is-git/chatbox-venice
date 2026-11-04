import { Alert, Button, Group, Select, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'
import { VeniceProfileSchema } from '@shared/types/settings'
import type { VeniceOptions, VeniceProfile } from '@shared/providers/definitions/models/venice/options'
import { parseExtraBody } from '@shared/models/utils/extra-body'
import { useProviderSettings } from '@/stores/settingsStore'

export function VeniceProfileEditor({ options, value, onChange }: { options: VeniceOptions; value: VeniceProfile; onChange: (value: VeniceProfile) => void }) {
  const set = (update: Partial<VeniceProfile>) => onChange({ ...value, ...update })
  return <Stack gap="sm">
    <Text fw={600}>Profilo Venice</Text>
    <Text size="xs" c="dimmed">Le opzioni della chat prevalgono sul modello; quelle del modello sul profilo salvato e sui valori del provider. I parametri extra JSON del modello hanno l'ultima precedenza.</Text>
    <Select label="Profilo salvato" clearable placeholder="Eredita" value={value.profileId || null} data={(options.profiles || []).map(p => ({ value: p.id, label: p.name }))} onChange={id => set({ profileId: id || undefined })} />
    <Select label="Modalità di ricerca" clearable placeholder="Eredita" value={value.webSearch || null} data={[{ value: 'off', label: 'Disattivata' }, { value: 'auto', label: 'Automatica' }, { value: 'on', label: 'Sempre' }]} onChange={mode => set({ webSearch: mode as VeniceProfile['webSearch'] || undefined })} />
    <Select label="Motore di ricerca" clearable placeholder="Eredita" value={value.searchProvider || null} data={['native', 'brave', 'google', 'exa']} onChange={engine => set({ searchProvider: engine as VeniceProfile['searchProvider'] || undefined })} />
    <Select label="Moderazione immagini (safe mode)" clearable placeholder="Eredita" value={value.imageSafeMode === undefined ? null : String(value.imageSafeMode)} data={[{ value: 'true', label: 'Attiva' }, { value: 'false', label: 'Disattivata' }]} onChange={mode => set({ imageSafeMode: mode === null ? undefined : mode === 'true' })} />
    <Select label="Citazioni" clearable placeholder="Eredita" value={value.webCitations === undefined ? null : String(value.webCitations)} data={[{ value: 'true', label: 'Mostra' }, { value: 'false', label: 'Nascondi' }]} onChange={mode => set({ webCitations: mode === null ? undefined : mode === 'true' })} />
    <Button size="xs" variant="subtle" onClick={() => onChange({})}>Ripristina tutte le opzioni ereditate</Button>
  </Stack>
}

export function VeniceProfiles() {
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const [name, setName] = useState(''); const [json, setJson] = useState('{"webSearch":"on","searchProvider":"brave"}'); const [id, setId] = useState<string | null>(null); const [error, setError] = useState('')
  const save = () => {
    try {
      if (!name.trim()) throw new Error('Inserisci un nome')
      const parsed = parseExtraBody(json)
      if (!parsed) throw new Error('Inserisci un oggetto JSON')
      const profile = VeniceProfileSchema.strict().parse(parsed)
      const profileId = id || crypto.randomUUID()
      setProviderSettings({ venice: { ...options, profiles: [...(options.profiles || []).filter(p => p.id !== profileId), { id: profileId, name: name.trim(), options: profile }] } })
      setId(profileId); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return <Stack gap="sm">
    <Text fw={600}>Profili riutilizzabili</Text>
    <Select label="Modifica profilo" clearable placeholder="Nuovo profilo" value={id} data={(options.profiles || []).map(p => ({ value: p.id, label: p.name }))} onChange={value => { setId(value); const profile = options.profiles?.find(p => p.id === value); setName(profile?.name || ''); setJson(JSON.stringify(profile?.options || {}, null, 2)); setError('') }} />
    <TextInput label="Nome profilo" value={name} onChange={e => setName(e.currentTarget.value)} />
    <Textarea label="Opzioni del profilo JSON" description={'Esempio: {"webSearch":"auto","searchProvider":"exa","imageSafeMode":false}'} autosize minRows={3} value={json} onChange={e => setJson(e.currentTarget.value)} />
    {error && <Alert color="red" role="alert">{error}</Alert>}
    <Group><Button variant="default" onClick={save}>Salva profilo</Button>{id && <Button color="red" variant="subtle" onClick={() => { setProviderSettings({ venice: { ...options, profiles: options.profiles?.filter(p => p.id !== id) } }); setId(null); setName(''); setJson('{}') }}>Elimina profilo</Button>}</Group>
    <Text size="xs" c="dimmed">Le chat che usavano un profilo eliminato torneranno a ereditare i valori del provider, conservando le proprie opzioni esplicite.</Text>
  </Stack>
}
