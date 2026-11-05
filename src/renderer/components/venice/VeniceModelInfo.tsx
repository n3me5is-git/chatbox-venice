import { registerPlugin } from '@capacitor/core'
import { Accordion, Alert, Button, Code, Group, Modal, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import type { MediaCatalogItem } from '@shared/providers/definitions/models/venice/media'
import platform from '@/platform'
import { VeniceModelBadges } from './VeniceModelBadges'
const paths: Record<string, string> = { text: 'chat/completions', image: 'image/generate', inpaint: 'image/multi-edit', tts: 'audio/speech', asr: 'audio/transcriptions', video: 'video/queue', music: 'audio/queue', embedding: 'embeddings/create' }
export function VeniceModelInfo({ model }: { model?: MediaCatalogItem }) {
  const [opened, setOpened] = useState(false); const [browser, setBrowser] = useState<string | null>(null); const [error, setError] = useState('')
  if (!model) return null
  const spec = model.model_spec; const docs = `https://docs.venice.ai/api-reference/endpoint/${paths[model.type] || 'models/list'}`
  const card = `https://venice.ai/models/${encodeURIComponent(model.id)}`
  return <><Button size="xs" variant="subtle" onClick={() => setOpened(true)}>Scheda e opzioni del modello</Button>
    <Modal opened={opened} onClose={() => { setOpened(false); setBrowser(null) }} title={spec?.name || model.id} size="xl" withinPortal>
      <Stack gap="sm"><Text size="xs" c="dimmed">{model.id} · {model.type}</Text><VeniceModelBadges metadata={spec} />
        {spec?.description && <Text>{spec.description}</Text>}
        <Text size="sm">Privacy, filtri, prezzi e parametri sono quelli dichiarati da Venice. Un’opzione assente non è una capacità verificata.</Text>
        <Group><Button size="xs" onClick={() => setBrowser(card)}>Scheda Venice</Button><Button size="xs" variant="default" onClick={() => setBrowser(docs)}>Documentazione API</Button>
        <Button size="xs" variant="subtle" onClick={() => void platform.openLink(browser || card)}>Apri nel browser</Button>
        {(platform.isDesktopLike || platform.type === 'mobile') && <Button size="xs" variant="subtle" onClick={() => { setError(''); void (platform.isDesktopLike ? window.electronAPI.invoke('openLink', browser || card, { browser: 'chrome' }) : registerPlugin<{ openInChrome(input: { url: string }): Promise<void> }>('DocumentSaver').openInChrome({ url: browser || card })).catch(() => setError('Chrome non disponibile. Usa Apri nel browser.')) }}>Apri su Chrome</Button>}</Group>
        {error && <Alert color="orange">{error}</Alert>}
        {browser && <><Text size="xs" c="dimmed">Se il sito impedisce la visualizzazione incorporata, usa Apri nel browser.</Text><iframe title="Documentazione Venice" src={browser} sandbox="allow-scripts allow-same-origin allow-popups" referrerPolicy="no-referrer" style={{ width: '100%', height: '55dvh', border: 0 }} /></>}
        <Title order={5}>Impostazioni consentite dal catalogo</Title><ScrollArea mah={340}><Code block>{JSON.stringify(spec?.constraints || {}, null, 2)}</Code>
        <Code block>{JSON.stringify(Object.fromEntries(Object.entries(spec || {}).filter(([key]) => /supports_|required|duration|format|voice|speed|prompt|lyrics|pricing|capabilities/.test(key))), null, 2)}</Code></ScrollArea>
      </Stack>
    </Modal></>
}
