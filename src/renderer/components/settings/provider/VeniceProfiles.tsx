import { Accordion, Alert, Button, Group, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'
import { VeniceProfileSchema } from '@shared/types/settings'
import type { VeniceOptions, VeniceProfile } from '@shared/providers/definitions/models/venice/options'
import { mergeExtraBody, parseExtraBody } from '@shared/models/utils/extra-body'
import { useProviderSettings } from '@/stores/settingsStore'

export function VeniceProfileEditor({ options, value, onChange, allowPreset = true }: { options: VeniceOptions; value: VeniceProfile; onChange: (value: VeniceProfile) => void; allowPreset?: boolean }) {
  const set = (update: Partial<VeniceProfile>) => onChange({ ...value, ...update })
  return <Stack gap="sm">
    {allowPreset && <><Text fw={600}>Personalizza Venice</Text><Text size="xs" c="dimmed">Scegli un profilo oppure personalizza le singole opzioni. I campi lasciati vuoti usano le impostazioni generali.</Text>
      <Select label="Profilo salvato" clearable placeholder="Impostazioni generali" value={value.profileId || null} data={(options.profiles || []).map(p => ({ value: p.id, label: p.name }))} onChange={id => set({ profileId: id || undefined })} /></>}
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Select label="Quando cercare sul web" clearable placeholder="Impostazioni generali" value={value.webSearch || null} data={[{ value: 'off', label: 'Non cercare' }, { value: 'auto', label: 'Quando serve' }, { value: 'on', label: 'Ad ogni messaggio' }]} onChange={mode => set({ webSearch: mode as VeniceProfile['webSearch'] || undefined })} />
      <Select label="Motore di ricerca" clearable placeholder="Impostazioni generali" value={value.searchProvider || null} data={[{ value: 'native', label: 'Venice' }, { value: 'brave', label: 'Brave' }, { value: 'google', label: 'Google' }, { value: 'exa', label: 'Exa' }]} onChange={engine => set({ searchProvider: engine as VeniceProfile['searchProvider'] || undefined })} />
      <Select label="Filtro contenuti nelle immagini" clearable placeholder="Impostazioni generali" value={value.imageSafeMode === undefined ? null : String(value.imageSafeMode)} data={[{ value: 'true', label: 'Attivo' }, { value: 'false', label: 'Disattivato' }]} onChange={mode => set({ imageSafeMode: mode === null ? undefined : mode === 'true' })} />
      <Select label="Fonti delle risposte" clearable placeholder="Impostazioni generali" value={value.webCitations === undefined ? null : String(value.webCitations)} data={[{ value: 'true', label: 'Mostra i link alle fonti' }, { value: 'false', label: 'Nascondi le fonti' }]} onChange={mode => set({ webCitations: mode === null ? undefined : mode === 'true' })} />
    </SimpleGrid>
    {allowPreset && <Button size="xs" variant="subtle" onClick={() => onChange({})}>Ripristina impostazioni generali</Button>}
  </Stack>
}

export function VeniceProfiles() {
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const [name, setName] = useState(''); const [form, setForm] = useState<VeniceProfile>({}); const [json, setJson] = useState(''); const [id, setId] = useState<string | null>(null); const [error, setError] = useState('')
  const save = () => {
    try {
      if (!name.trim()) throw new Error('Dai un nome al profilo per salvarlo.')
      const profile = VeniceProfileSchema.strict().parse(mergeExtraBody(form, parseExtraBody(json) || {}))
      const profileId = id || crypto.randomUUID()
      setProviderSettings({ venice: { ...options, profiles: [...(options.profiles || []).filter(p => p.id !== profileId), { id: profileId, name: name.trim(), options: profile }] } })
      setId(profileId); setError('')
    } catch { setError('Controlla il nome e le opzioni avanzate: il profilo non è stato salvato.') }
  }
  return <Accordion variant="contained" radius="md"><Accordion.Item value="profiles"><Accordion.Control>I tuoi profili</Accordion.Control><Accordion.Panel><Stack gap="sm">
    <Text size="sm" c="dimmed">Salva le combinazioni che usi spesso, ad esempio “Ricerca approfondita” o “Chat senza web”. Potrai sceglierle per ogni modello o chat.</Text>
    <Select label="Modifica profilo" clearable placeholder="Crea un nuovo profilo" value={id} data={(options.profiles || []).map(p => ({ value: p.id, label: p.name }))} onChange={value => { setId(value); const profile = options.profiles?.find(p => p.id === value); setName(profile?.name || ''); setForm(profile?.options || {}); setJson(''); setError('') }} />
    <TextInput label="Nome profilo" placeholder="Ad esempio: Ricerca approfondita" value={name} onChange={e => setName(e.currentTarget.value)} />
    <VeniceProfileEditor options={options} value={form} onChange={setForm} allowPreset={false} />
    <Accordion variant="default"><Accordion.Item value="advanced"><Accordion.Control>Opzioni avanzate del profilo</Accordion.Control><Accordion.Panel><Textarea label="Opzioni del profilo JSON" description="Facoltativo. Questi valori prevalgono sulle scelte qui sopra." placeholder={'{"image":{"seed":42}}'} autosize minRows={3} value={json} onChange={e => setJson(e.currentTarget.value)} /></Accordion.Panel></Accordion.Item></Accordion>
    {error && <Alert color="red" role="alert">{error}</Alert>}
    <Group><Button variant="default" onClick={save}>Salva profilo</Button>{id && <Button color="red" variant="subtle" onClick={() => { setProviderSettings({ venice: { ...options, profiles: options.profiles?.filter(p => p.id !== id) } }); setId(null); setName(''); setForm({}); setJson('') }}>Elimina profilo</Button>}</Group>
  </Stack></Accordion.Panel></Accordion.Item></Accordion>
}
