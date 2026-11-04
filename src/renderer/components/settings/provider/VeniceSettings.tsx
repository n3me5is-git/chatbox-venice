import { VeniceProfiles } from './VeniceProfiles'
import { Accordion, NumberInput, Select, SimpleGrid, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core'
import type { ProviderSettings } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { useProviderSettings } from '@/stores/settingsStore'

type Options = NonNullable<ProviderSettings['venice']>

export function VeniceSearchSettings() {
  const { t } = useTranslation()
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const update = (value: Partial<Options>) => setProviderSettings({ venice: { ...options, ...value } })
  return <Stack gap="sm" p="sm">
    <Text size="xs" c="dimmed">{t('Venice handles search directly. These defaults apply to all Venice chats; per-model JSON can override them.')}</Text>
    <Select label={t('Search provider')} allowDeselect={false} value={options.searchProvider ?? 'native'}
      data={[{ value: 'native', label: t('Venice native chat search') }, { value: 'brave', label: 'Brave (Zero Data Retention)' }, { value: 'google', label: t('Google (anonymized by Venice)') }, { value: 'exa', label: 'Exa (Zero Data Retention)' }]}
      onChange={(value) => update({ searchProvider: value as Options['searchProvider'] })} />
    <Select label={t('Web search mode')} allowDeselect={false} value={options.webSearch ?? 'off'}
      data={[{ value: 'off', label: t('Off') }, { value: 'auto', label: t('Automatic') }, { value: 'on', label: t('Always search') }]}
      onChange={(value) => update({ webSearch: value as Options['webSearch'] })} />
    <Switch label={t('Read URLs from the message')} checked={options.webScraping ?? false} onChange={(event) => update({ webScraping: event.currentTarget.checked })} />
    <Switch label={t('Show source citations')} checked={options.webCitations ?? true} onChange={(event) => update({ webCitations: event.currentTarget.checked })} />
    <Text size="xs" c="dimmed">{t('Automatic search with Brave, Google or Exa requires tool use. X search takes precedence when enabled.')}</Text>
    <Switch label={t('Use X search on compatible Grok models')} checked={options.xSearch ?? false} onChange={(event) => update({ xSearch: event.currentTarget.checked })} />
    <Switch label={t('Include Venice system prompt')} checked={options.includeSystemPrompt ?? true} onChange={(event) => update({ includeSystemPrompt: event.currentTarget.checked })} />
  </Stack>
}

export function VeniceImageSettings() {
  const { t } = useTranslation()
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const image = options.image || {}
  const update = (value: Partial<Options>) => setProviderSettings({ venice: { ...options, ...value } })
  const updateImage = (value: Partial<NonNullable<Options['image']>>) => update({ image: { ...image, ...value } })
  return <Accordion variant="contained">
    <Accordion.Item value="venice-images">
      <Accordion.Control>{t('Venice image settings')}</Accordion.Control>
      <Accordion.Panel><Stack gap="sm">
        <Text size="xs" c="dimmed">{t('Generation goes directly to Venice. History and images stay on this device and can be deleted. Available options depend on the model.')}</Text>
        <Switch label={t('Blur adult content (safe mode)')} checked={options.imageSafeMode ?? true} onChange={(event) => update({ imageSafeMode: event.currentTarget.checked })} />
        <Switch label={t('Image web search (supported models)')} checked={options.imageWebSearch ?? false} onChange={(event) => update({ imageWebSearch: event.currentTarget.checked })} />
        <Textarea label={t('Negative prompt')} value={image.negative_prompt ?? ''} onChange={(event) => updateImage({ negative_prompt: event.currentTarget.value || undefined })} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t('Image format')} allowDeselect={false} value={image.format ?? 'png'} data={['png', 'jpeg', 'webp']} onChange={(value) => updateImage({ format: value as 'png' | 'jpeg' | 'webp' })} />
          <Select label={t('Resolution')} placeholder={String(t('Model default'))} clearable value={image.resolution ?? null} data={['1K', '2K', '4K']} onChange={(value) => updateImage({ resolution: value || undefined })} />
          <Select label={t('Quality')} placeholder={String(t('Model default'))} clearable value={image.quality ?? null} data={['low', 'medium', 'high']} onChange={(value) => updateImage({ quality: value as 'low' | 'medium' | 'high' || undefined })} />
          <TextInput label={t('Style preset')} value={image.style_preset ?? ''} onChange={(event) => updateImage({ style_preset: event.currentTarget.value || undefined })} />
          <NumberInput label={t('Width (pixels)')} placeholder={String(t('Model default'))} min={64} max={4096} step={64} value={image.width ?? ''} onChange={(value) => updateImage({ width: typeof value === 'number' ? value : undefined })} />
          <NumberInput label={t('Height (pixels)')} placeholder={String(t('Model default'))} min={64} max={4096} step={64} value={image.height ?? ''} onChange={(value) => updateImage({ height: typeof value === 'number' ? value : undefined })} />
          <NumberInput label={t('Steps')} min={1} max={100} value={image.steps ?? ''} onChange={(value) => updateImage({ steps: typeof value === 'number' ? value : undefined })} />
          <NumberInput label={t('CFG scale')} min={0.1} max={20} step={0.5} value={image.cfg_scale ?? ''} onChange={(value) => updateImage({ cfg_scale: typeof value === 'number' ? value : undefined })} />
          <NumberInput label={t('Seed')} min={-999999999} max={999999999} value={image.seed ?? ''} onChange={(value) => updateImage({ seed: typeof value === 'number' ? value : undefined })} />
        </SimpleGrid>
        <Text size="xs" c="dimmed">{t('Choose either pixel dimensions or an aspect ratio in the image toolbar.')}</Text>
        <Switch label={t('Enhance prompt (may cost extra)')} checked={image.enhance_prompt ?? false} onChange={(event) => updateImage({ enhance_prompt: event.currentTarget.checked })} />
        <Switch label={t('Hide watermark')} checked={image.hide_watermark ?? false} onChange={(event) => updateImage({ hide_watermark: event.currentTarget.checked })} />
        <Switch label={t('Embed prompt in image metadata')} checked={image.embed_exif_metadata ?? false} onChange={(event) => updateImage({ embed_exif_metadata: event.currentTarget.checked })} />
      </Stack></Accordion.Panel>
    </Accordion.Item>
  </Accordion>
}

export function VeniceModuleSettings() {
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const update = (value: Partial<Options>) => setProviderSettings({ venice: { ...options, ...value } })
  return <Stack gap="sm" p="sm">
    <Switch label="Abilita supporto Venice" checked={options.enabled !== false} onChange={e => update({ enabled: e.currentTarget.checked })} />
    <Text size="xs" c="dimmed">La disattivazione blocca le nuove richieste Venice e interrompe l'attesa dei media. Non cancella cronologia o chiavi e non annulla eventuali lavori già in corso sul server.</Text>
    <Switch label="Audio e trascrizione" disabled={options.enabled === false} checked={options.audioEnabled === true} onChange={e => update({ audioEnabled: e.currentTarget.checked })} />
    <Switch label="Generazione video" disabled={options.enabled === false} checked={options.videoEnabled === true} onChange={e => update({ videoEnabled: e.currentTarget.checked })} />
    <Switch label="Musica ed effetti sonori" disabled={options.enabled === false} checked={options.musicEnabled === true} onChange={e => update({ musicEnabled: e.currentTarget.checked })} />
    <Switch label="Tool Venice nelle chat in modalità Lavoro" disabled={options.enabled === false} checked={options.chatToolsEnabled === true} onChange={e => update({ chatToolsEnabled: e.currentTarget.checked })} />
    <Switch label="Conferma prima delle generazioni richieste dai tool" disabled={!options.chatToolsEnabled} checked={options.confirmMediaTools !== false} onChange={e => update({ confirmMediaTools: e.currentTarget.checked })} />
    <Text size="xs" c="dimmed">I nuovi moduli sono facoltativi. Usa Venice Studio dal menu laterale dopo averne abilitato almeno uno. Le funzioni locali e gli altri provider mantengono le loro impostazioni.</Text>
    <VeniceProfiles />
  </Stack>
}
