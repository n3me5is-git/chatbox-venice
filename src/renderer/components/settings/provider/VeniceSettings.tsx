import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { VeniceBalance } from '@/components/venice/VeniceBalance'
import { VeniceProfiles } from './VeniceProfiles'
import { Accordion, Button, NumberInput, Select, SimpleGrid, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core'
import type { ProviderSettings } from '@shared/types'
import { useProviderSettings } from '@/stores/settingsStore'
type Options = NonNullable<ProviderSettings['venice']>
export function VeniceSearchSettings() {
  useTranslation()
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const update = (value: Partial<Options>) => setProviderSettings({ venice: { ...options, ...value } })
  return <Stack gap="sm" p="sm">
    <Text size="sm" c="dimmed">{ft("Choose when to search the web for current information. You can select a different profile for each chat.")}</Text>
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Select label={ft("When to search")} allowDeselect={false} value={options.webSearch ?? 'off'} data={[{ value: 'off', label: ft("Do not search") }, { value: 'auto', label: ft("When needed") }, { value: 'on', label: ft("For every message") }]} onChange={value => update({ webSearch: value as Options['webSearch'] })} />
      <Select label={ft("Search engine")} allowDeselect={false} value={options.searchProvider ?? 'native'} data={[{ value: 'native', label: ft("Venice (built in)") }, { value: 'brave', label: 'Brave' }, { value: 'google', label: 'Google' }, { value: 'exa', label: 'Exa' }]} onChange={value => update({ searchProvider: value as Options['searchProvider'] })} />
    </SimpleGrid>
    <Switch label={ft("Show source links")} checked={options.webCitations ?? true} onChange={e => update({ webCitations: e.currentTarget.checked })} />
    <Switch label={ft("Read web pages I share in chat")} checked={options.webScraping ?? false} onChange={e => update({ webScraping: e.currentTarget.checked })} />
    <Text size="xs" c="dimmed">{ft("Search uses Venice and may incur an extra cost. Automatic search depends on the selected model.")}</Text>
    <Accordion variant="default"><Accordion.Item value="advanced"><Accordion.Control>{ft("Advanced search options")}</Accordion.Control><Accordion.Panel><Stack gap="sm">
      <Switch label={ft("Also search X (compatible Grok models)")} checked={options.xSearch ?? false} onChange={e => update({ xSearch: e.currentTarget.checked })} />
      <Text size="xs" c="dimmed">{ft("When enabled, X search takes precedence over the selected search engine.")}</Text>
      <Switch label={ft("Use Venice default instructions")} checked={options.includeSystemPrompt ?? true} onChange={e => update({ includeSystemPrompt: e.currentTarget.checked })} />
    </Stack></Accordion.Panel></Accordion.Item></Accordion>
  </Stack>
}
export function VeniceImageSettings() {
  useTranslation()
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}; const image = options.image || {}
  const update = (value: Partial<Options>) => setProviderSettings({ venice: { ...options, ...value } })
  const updateImage = (value: Partial<NonNullable<Options['image']>>) => update({ image: { ...image, ...value } })
  return <Accordion variant="contained" radius="md"><Accordion.Item value="venice-images"><Accordion.Control>{ft("Venice images")}</Accordion.Control><Accordion.Panel><Stack gap="sm">
    <Switch label={ft("Filter sensitive content")} checked={options.imageSafeMode ?? true} onChange={e => update({ imageSafeMode: e.currentTarget.checked })} />
    <Switch label={ft("Use web images as references")} checked={options.imageWebSearch ?? false} onChange={e => update({ imageWebSearch: e.currentTarget.checked })} />
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Select label={ft("File format")} allowDeselect={false} value={image.format ?? 'png'} data={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }]} onChange={value => updateImage({ format: value as 'png' | 'jpeg' | 'webp' })} />
      <Select label={ft("Resolution")} placeholder={ft("Recommended by the model")} clearable value={image.resolution ?? null} data={[{ value: '1K', label: 'Standard · 1K' }, { value: '2K', label: ft("High · 2K") }, { value: '4K', label: ft("Very high · 4K") }]} onChange={value => updateImage({ resolution: value || undefined })} />
      <Select label={ft("Quality")} placeholder={ft("Recommended by the model")} clearable value={image.quality ?? null} data={[{ value: 'low', label: ft("Fast") }, { value: 'medium', label: ft("Balanced") }, { value: 'high', label: ft("Maximum") }]} onChange={value => updateImage({ quality: value as 'low' | 'medium' | 'high' || undefined })} />
    </SimpleGrid>
    <Text size="xs" c="dimmed">{ft("Available options and costs depend on the selected model. Images and history are saved on this device.")}</Text>
    <Accordion variant="default"><Accordion.Item value="advanced"><Accordion.Control>{ft("Advanced image options")}</Accordion.Control><Accordion.Panel><Stack gap="sm">
      <Textarea label={ft("Elements to avoid")} placeholder={ft("For example: text, blur, background objects…")} value={image.negative_prompt ?? ''} onChange={e => updateImage({ negative_prompt: e.currentTarget.value || undefined })} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={ft("Custom style")} value={image.style_preset ?? ''} onChange={e => updateImage({ style_preset: e.currentTarget.value || undefined })} />
        <NumberInput label={ft("Exact width (pixels)")} placeholder={ft("Automatic")} min={64} max={4096} step={64} value={image.width ?? ''} onChange={value => updateImage({ width: typeof value === 'number' ? value : undefined })} />
        <NumberInput label={ft("Exact height (pixels)")} placeholder={ft("Automatic")} min={64} max={4096} step={64} value={image.height ?? ''} onChange={value => updateImage({ height: typeof value === 'number' ? value : undefined })} />
        <NumberInput label={ft("Generation steps")} min={1} max={100} value={image.steps ?? ''} onChange={value => updateImage({ steps: typeof value === 'number' ? value : undefined })} />
        <NumberInput label={ft("Prompt guidance (CFG)")} min={0.1} max={20} step={0.5} value={image.cfg_scale ?? ''} onChange={value => updateImage({ cfg_scale: typeof value === 'number' ? value : undefined })} />
        <NumberInput label={ft("Reproducible variation (seed)")} min={-999999999} max={999999999} value={image.seed ?? ''} onChange={value => updateImage({ seed: typeof value === 'number' ? value : undefined })} />
      </SimpleGrid>
      <Text size="xs" c="dimmed">{ft("Choose exact dimensions or an aspect ratio in the generator toolbar.")}</Text>
      <Switch label={ft("Enhance the prompt automatically (may cost extra)")} checked={image.enhance_prompt ?? false} onChange={e => updateImage({ enhance_prompt: e.currentTarget.checked })} />
      <Switch label={ft("Hide watermark")} checked={image.hide_watermark ?? false} onChange={e => updateImage({ hide_watermark: e.currentTarget.checked })} />
      <Switch label={ft("Save prompt in image metadata")} checked={image.embed_exif_metadata ?? false} onChange={e => updateImage({ embed_exif_metadata: e.currentTarget.checked })} />
      <Text size="xs" c="dimmed">{ft("Anyone who receives the file can read its metadata. Prompt metadata stays off until you enable it.")}</Text>
    </Stack></Accordion.Panel></Accordion.Item></Accordion>
  </Stack></Accordion.Panel></Accordion.Item></Accordion>
}
export function VeniceModuleSettings() {
  useTranslation()
  const { providerSettings, setProviderSettings } = useProviderSettings('venice')
  const options = providerSettings?.venice || {}
  const update = (value: Partial<Options>) => setProviderSettings({ venice: { ...options, ...value } })
  return <Stack gap="sm" p="sm">
    <Switch label={ft("Enable Venice")} checked={options.enabled !== false} onChange={e => update({ enabled: e.currentTarget.checked })} />
    <Text size="xs" c="dimmed">{ft("When disabled, new requests are blocked and media waiting stops. Saved content stays on this device.")}</Text>
    <VeniceBalance />
    <Text fw={600} mt="sm">{ft("What would you like to use?")}</Text>
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Switch label={ft("Voice and transcription")} disabled={options.enabled === false} checked={options.audioEnabled === true} onChange={e => update({ audioEnabled: e.currentTarget.checked })} />
      <Switch label="Video" disabled={options.enabled === false} checked={options.videoEnabled === true} onChange={e => update({ videoEnabled: e.currentTarget.checked })} />
      <Switch label={ft("Music and sound effects")} disabled={options.enabled === false} checked={options.musicEnabled === true} onChange={e => update({ musicEnabled: e.currentTarget.checked })} />
    </SimpleGrid>
    <Text size="xs" c="dimmed">{ft("Enabled modules are available in Venice Studio in the sidebar.")}</Text>
    <Switch label={ft("Internal Venice MCP: tools in Work mode chats")} disabled={options.enabled === false} checked={options.chatToolsEnabled !== false} onChange={e => update({ chatToolsEnabled: e.currentTarget.checked })} />
    <Text size="xs" c="dimmed">{ft("Generation approval is managed in each chat, next to the Venice balance.")}</Text>
    <VeniceProfiles />
  </Stack>
}
