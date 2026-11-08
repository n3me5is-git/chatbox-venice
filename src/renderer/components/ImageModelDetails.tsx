import { Button, Group, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Drawer } from 'vaul'
import type { ImageModelGroup } from '@/hooks/useImageModelGroups'
import type { ImageModelOption } from '@/packages/image-model-catalog'
import { useOverlayManager } from './layout/Overlay'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { AdaptiveModal } from './common/AdaptiveModal'
import { VeniceModelDetails } from './venice/VeniceModelInfo'
import { DRAWER_SURFACE_STYLE, MODEL_SELECTOR_SURFACE_CLASS } from './ModelSelectorV2/constants'
import { DetailCard } from './ModelSelectorV2/DetailCard'
import type { DetailModel } from './ModelSelectorV2/types'

export function getImageModelDetail(group: ImageModelGroup, model: ImageModelOption): DetailModel {
  return {
    providerId: group.providerId,
    providerName: group.label,
    modelId: model.modelId,
    name: model.displayName,
    description: model.description?.trim() || undefined,
    type: 'image',
    vendorMetadata: model.vendorMetadata,
  }
}

export function ImageModelDetailDrawer({
  model,
  onClose,
  onRestoreFocus,
}: {
  model: DetailModel | null
  onClose: () => void
  onRestoreFocus: () => void
}) {
  const { t } = useTranslation()
  const mobile = useIsSmallScreen()
  const venice = model?.providerId === 'venice'
  const isTopOverlay = useOverlayManager(!!model && mobile,onClose)
  const veniceModel=model?{ id: model.modelId, type: String(model.vendorMetadata?.veniceType || 'image'), model_spec: { ...model.vendorMetadata, name: model.name, description: model.description } }:undefined
  if (venice && !mobile) return <VeniceModelDetails model={veniceModel} onClose={onClose}/>
  if (!mobile) return <AdaptiveModal opened={!!model} onClose={onClose} title={t('Model details')} size="sm">{model && <DetailCard model={model} onClose={onClose} mobile/>}</AdaptiveModal>
  return (
    <Drawer.Root open={!!model} onOpenChange={(open) => !open && onClose()} noBodyStyles autoFocus>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-chatbox-background-mask-overlay" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 outline-none max-h-[90dvh] overflow-y-auto"
          data-vaul-no-drag
          style={{overscrollBehavior:'contain',touchAction:'pan-y',WebkitOverflowScrolling:'touch'}}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            onRestoreFocus()
          }}
          onEscapeKeyDown={(event) => {
            if (!isTopOverlay) event.preventDefault()
          }}
        >
          <Stack
            gap={0}
            className={`rounded-t-[16px] border border-b-0 border-solid ${MODEL_SELECTOR_SURFACE_CLASS}`}
            style={DRAWER_SURFACE_STYLE}
          >
            <div aria-hidden className="mx-auto my-3 h-1 w-14 rounded-full bg-chatbox-tint-tertiary opacity-70" />
            <Drawer.Title className="hidden">{t('Model details')}</Drawer.Title>
            {venice?<Stack p="md"><Group justify="space-between"><Text fw={700}>{model?.name}</Text><Button size="xs" variant="default" onClick={onClose}>{t('Close')}</Button></Group><VeniceModelDetails model={veniceModel} onClose={onClose} inline/></Stack>:model && <DetailCard model={model} onClose={onClose} mobile />}
            <div className="h-[--mobile-safe-area-inset-bottom] min-h-4" />
          </Stack>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
