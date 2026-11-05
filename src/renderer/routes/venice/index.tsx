import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ScrollArea, SegmentedControl, Stack } from '@mantine/core'
import Page from '@/components/layout/Page'
import { VeniceStudio } from '@/components/venice/VeniceStudio'
import { VeniceBalance } from '@/components/venice/VeniceBalance'
import { veniceMediaService } from '@/packages/venice/service'
import { useProviderSettings } from '@/stores/settingsStore'
import { navigateToSettings } from '@/modals/settings-navigation'
import { ImageCreatorPage } from '@/routes/image-creator/index'
import type { MediaKind } from '@shared/providers/definitions/models/venice/media'
export const Route = createFileRoute('/venice/')({ component: StudioRoute })
function StudioRoute() {
  const { providerSettings } = useProviderSettings('venice')
  const [pane, setPane] = useState('image')
  return <Page title="Venice Studio"><Stack gap="sm" p="sm" mih={0}><VeniceBalance /><ScrollArea type="auto"><SegmentedControl aria-label="Tipo di creazione Venice" value={pane} onChange={setPane} data={[{ value: 'image', label: 'Immagini' }, { value: 'speech', label: 'Voce' }, { value: 'transcription', label: 'Trascrivi' }, { value: 'video', label: 'Video' }, { value: 'music', label: 'Musica e suoni' }]} /></ScrollArea>
    {pane === 'image' ? <ImageCreatorPage onlyVenice embedded /> : <VeniceStudio key={pane} hideTabs initialKind={pane as MediaKind} service={veniceMediaService} options={providerSettings?.venice || {}} openSettings={() => navigateToSettings('/provider/venice')} />}
  </Stack></Page>
}
