import { createFileRoute } from '@tanstack/react-router'
import { VeniceStudio } from '@/components/venice/VeniceStudio'
import { veniceMediaService } from '@/packages/venice/service'
import { useProviderSettings } from '@/stores/settingsStore'
import { navigateToSettings } from '@/modals/settings-navigation'
export const Route = createFileRoute('/venice/')({ component: StudioRoute })
function StudioRoute() {
  const { providerSettings } = useProviderSettings('venice')
  return <VeniceStudio service={veniceMediaService} options={providerSettings?.venice || {}} openSettings={() => navigateToSettings('/provider/venice')} />
}
