import { VeniceBalance } from '@/components/venice/VeniceBalance'
import { VeniceProfiles } from './VeniceProfiles'
import { Accordion, Button, NumberInput, Select, SimpleGrid, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core'
import type { ProviderSettings } from '@shared/types'
import { useProviderSettings } from '@/stores/settingsStore'
type Options = NonNullable<ProviderSettings['venice']>
export function VeniceSearchSettings() {
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const update = (value: Partial<Options>) => setProviderSettings({ venice: { ...options, ...value } })
  return <Stack gap="sm" p="sm">
    <Text size="sm" c="dimmed">Scegli quando cercare informazioni aggiornate sul web. Nelle singole chat puoi scegliere un profilo diverso.</Text>
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Select label="Quando cercare" allowDeselect={false} value={options.webSearch ?? 'off'} data={[{ value: 'off', label: 'Non cercare' }, { value: 'auto', label: 'Quando serve' }, { value: 'on', label: 'Ad ogni messaggio' }]} onChange={value => update({ webSearch: value as Options['webSearch'] })} />
      <Select label="Motore di ricerca" allowDeselect={false} value={options.searchProvider ?? 'native'} data={[{ value: 'native', label: 'Venice (integrata)' }, { value: 'brave', label: 'Brave' }, { value: 'google', label: 'Google' }, { value: 'exa', label: 'Exa' }]} onChange={value => update({ searchProvider: value as Options['searchProvider'] })} />
    </SimpleGrid>
    <Switch label="Mostra i link alle fonti" checked={options.webCitations ?? true} onChange={e => update({ webCitations: e.currentTarget.checked })} />
    <Switch label="Leggi le pagine web che condivido nella chat" checked={options.webScraping ?? false} onChange={e => update({ webScraping: e.currentTarget.checked })} />
    <Text size="xs" c="dimmed">La ricerca passa da Venice e può avere un costo aggiuntivo. La modalità automatica dipende dalle funzioni del modello scelto.</Text>
    <Accordion variant="default"><Accordion.Item value="advanced"><Accordion.Control>Opzioni avanzate di ricerca</Accordion.Control><Accordion.Panel><Stack gap="sm">
      <Switch label="Cerca anche su X (modelli Grok compatibili)" checked={options.xSearch ?? false} onChange={e => update({ xSearch: e.currentTarget.checked })} />
      <Text size="xs" c="dimmed">La ricerca su X, se attiva, ha la precedenza sul motore selezionato.</Text>
      <Switch label="Usa le istruzioni predefinite di Venice" checked={options.includeSystemPrompt ?? true} onChange={e => update({ includeSystemPrompt: e.currentTarget.checked })} />
    </Stack></Accordion.Panel></Accordion.Item></Accordion>
  </Stack>
}
export function VeniceImageSettings() {
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}; const image = options.image || {}
  const update = (value: Partial<Options>) => setProviderSettings({ venice: { ...options, ...value } })
  const updateImage = (value: Partial<NonNullable<Options['image']>>) => update({ image: { ...image, ...value } })
  return <Accordion variant="contained" radius="md"><Accordion.Item value="venice-images"><Accordion.Control>Immagini Venice</Accordion.Control><Accordion.Panel><Stack gap="sm">
    <Switch label="Filtra i contenuti sensibili" checked={options.imageSafeMode ?? true} onChange={e => update({ imageSafeMode: e.currentTarget.checked })} />
    <Switch label="Usa immagini dal web come riferimento" checked={options.imageWebSearch ?? false} onChange={e => update({ imageWebSearch: e.currentTarget.checked })} />
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Select label="Formato del file" allowDeselect={false} value={image.format ?? 'png'} data={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }]} onChange={value => updateImage({ format: value as 'png' | 'jpeg' | 'webp' })} />
      <Select label="Risoluzione" placeholder="Consigliata dal modello" clearable value={image.resolution ?? null} data={[{ value: '1K', label: 'Standard · 1K' }, { value: '2K', label: 'Alta · 2K' }, { value: '4K', label: 'Molto alta · 4K' }]} onChange={value => updateImage({ resolution: value || undefined })} />
      <Select label="Qualità" placeholder="Consigliata dal modello" clearable value={image.quality ?? null} data={[{ value: 'low', label: 'Rapida' }, { value: 'medium', label: 'Bilanciata' }, { value: 'high', label: 'Massima' }]} onChange={value => updateImage({ quality: value as 'low' | 'medium' | 'high' || undefined })} />
    </SimpleGrid>
    <Text size="xs" c="dimmed">Le opzioni disponibili e il costo dipendono dal modello scelto. Le immagini e la cronologia vengono salvate sul dispositivo.</Text>
    <Accordion variant="default"><Accordion.Item value="advanced"><Accordion.Control>Opzioni avanzate delle immagini</Accordion.Control><Accordion.Panel><Stack gap="sm">
      <Textarea label="Elementi da evitare" placeholder="Ad esempio: scritte, sfocatura, oggetti sullo sfondo…" value={image.negative_prompt ?? ''} onChange={e => updateImage({ negative_prompt: e.currentTarget.value || undefined })} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label="Stile personalizzato" value={image.style_preset ?? ''} onChange={e => updateImage({ style_preset: e.currentTarget.value || undefined })} />
        <NumberInput label="Larghezza precisa (pixel)" placeholder="Automatica" min={64} max={4096} step={64} value={image.width ?? ''} onChange={value => updateImage({ width: typeof value === 'number' ? value : undefined })} />
        <NumberInput label="Altezza precisa (pixel)" placeholder="Automatica" min={64} max={4096} step={64} value={image.height ?? ''} onChange={value => updateImage({ height: typeof value === 'number' ? value : undefined })} />
        <NumberInput label="Passaggi di generazione" min={1} max={100} value={image.steps ?? ''} onChange={value => updateImage({ steps: typeof value === 'number' ? value : undefined })} />
        <NumberInput label="Aderenza al testo (CFG)" min={0.1} max={20} step={0.5} value={image.cfg_scale ?? ''} onChange={value => updateImage({ cfg_scale: typeof value === 'number' ? value : undefined })} />
        <NumberInput label="Variazione riproducibile (seed)" min={-999999999} max={999999999} value={image.seed ?? ''} onChange={value => updateImage({ seed: typeof value === 'number' ? value : undefined })} />
      </SimpleGrid>
      <Text size="xs" c="dimmed">Scegli le dimensioni precise oppure un’inquadratura nella barra del generatore.</Text>
      <Switch label="Migliora automaticamente il testo (può costare di più)" checked={image.enhance_prompt ?? false} onChange={e => updateImage({ enhance_prompt: e.currentTarget.checked })} />
      <Switch label="Nascondi la filigrana" checked={image.hide_watermark ?? false} onChange={e => updateImage({ hide_watermark: e.currentTarget.checked })} />
      <Switch label="Salva il testo nei metadati dell’immagine" checked={image.embed_exif_metadata ?? false} onChange={e => updateImage({ embed_exif_metadata: e.currentTarget.checked })} />
      <Text size="xs" c="dimmed">Chi riceve un file può leggerne i metadati. L’inclusione del testo resta disattivata finché non la abiliti.</Text>
    </Stack></Accordion.Panel></Accordion.Item></Accordion>
  </Stack></Accordion.Panel></Accordion.Item></Accordion>
}
export function VeniceModuleSettings() {
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const update = (value: Partial<Options>) => setProviderSettings({ venice: { ...options, ...value } })
  return <Stack gap="sm" p="sm">
    <Switch label="Abilita Venice" checked={options.enabled !== false} onChange={e => update({ enabled: e.currentTarget.checked })} />
    <Text size="xs" c="dimmed">Se lo disattivi, le nuove richieste vengono bloccate e l’attesa dei media si interrompe. I contenuti già salvati restano sul dispositivo.</Text>
    <VeniceBalance />
    <Text fw={600} mt="sm">Che cosa vuoi usare?</Text>
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Switch label="Voce e trascrizione" disabled={options.enabled === false} checked={options.audioEnabled === true} onChange={e => update({ audioEnabled: e.currentTarget.checked })} />
      <Switch label="Video" disabled={options.enabled === false} checked={options.videoEnabled === true} onChange={e => update({ videoEnabled: e.currentTarget.checked })} />
      <Switch label="Musica ed effetti sonori" disabled={options.enabled === false} checked={options.musicEnabled === true} onChange={e => update({ musicEnabled: e.currentTarget.checked })} />
    </SimpleGrid>
    <Text size="xs" c="dimmed">I moduli abilitati sono disponibili in Venice Studio, nel menu laterale.</Text>
    <Switch label="MCP interno Venice: strumenti nelle chat in modalità Lavoro" disabled={options.enabled === false} checked={options.chatToolsEnabled !== false} onChange={e => update({ chatToolsEnabled: e.currentTarget.checked })} />
    {options.chatToolsEnabled !== false && <Switch label="Chiedi conferma prima di generare" checked={options.confirmMediaTools !== false} onChange={e => update({ confirmMediaTools: e.currentTarget.checked })} />}
    <VeniceProfiles />
  </Stack>
}
