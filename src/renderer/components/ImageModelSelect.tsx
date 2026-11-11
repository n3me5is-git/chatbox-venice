import {useOverlayManager} from './layout/Overlay'
import { VeniceModelBadges } from './venice/VeniceModelBadges'
import { VeniceModelCost } from './venice/VeniceModelCost'
import { imageVariant } from '@shared/providers/definitions/models/venice/image-reference-model'
import { forkT as ft } from '@/i18n/fork'
import { ActionIcon, Combobox, type ComboboxProps, Flex, HoverCard, Text, useCombobox } from '@mantine/core'
import type { ModelProvider } from '@shared/types'
import { IconInfoCircle, IconServer } from '@tabler/icons-react'
import { forwardRef, type PropsWithChildren, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageModelGroup } from '@/hooks/useImageModelGroups'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { ScalableIcon } from './common/ScalableIcon'
import { getImageModelDetail, ImageModelDetailDrawer } from './ImageModelDetails'
import { ModelIcon } from './icons/ModelIcon'
import ProviderIcon from './icons/ProviderIcon'
import { DESKTOP_DETAIL_CARD_GAP, DESKTOP_DETAIL_CARD_OUTER_WIDTH } from './ModelSelectorV2/constants'
import { DetailCard } from './ModelSelectorV2/DetailCard'
import type { DetailModel } from './ModelSelectorV2/types'

function ProviderGroupLabel({ providerId, name, isCustom }: { providerId: string; name: string; isCustom?: boolean }) {
  return (
    <Flex align="center" gap={6} className="px-2 pt-2.5 pb-1">
      {isCustom ? (
        <ScalableIcon icon={IconServer} size={12} className="text-chatbox-tint-gray" />
      ) : (
        <ProviderIcon size={12} provider={providerId} className="opacity-50" />
      )}
      <Text size="xs" fw={500} c="dimmed">
        {name}
      </Text>
    </Flex>
  )
}

export type ImageModelSelectProps = PropsWithChildren<
  {
    modelGroups: ImageModelGroup[]
    opened?: boolean
    onChange?: (opened: boolean) => void
    onSelect?: (provider: ModelProvider, model: string) => void
  } & ComboboxProps
>

export const ImageModelSelect = forwardRef<HTMLButtonElement, ImageModelSelectProps>(
  ({ modelGroups, opened, onChange, onSelect, children, ...comboboxProps }, ref) => {
    const { t } = useTranslation()
    const selectorId = useId()
    const isMobile = useIsSmallScreen()
    const [targetNode, setTargetNode] = useState<HTMLElement | null>(null)
    const [dropdownNode, setDropdownNode] = useState<HTMLDivElement | null>(null)
    const [mobileDetail, setMobileDetail] = useState<DetailModel | null>(null)
    const [detailResetKey, setDetailResetKey] = useState(0)
    const [search,setSearch]=useState('')
    const openingDetailRef = useRef(false)
    const modalContent = isMobile ? targetNode?.closest<HTMLElement>('.mantine-Modal-content,.mantine-Drawer-content,[data-vaul-drawer]') : null

    const combobox = useCombobox({
      opened,
      onOpenedChange: onChange,
      onDropdownClose: () => {
        combobox.resetSelectedOption()
        if (!openingDetailRef.current) combobox.focusTarget()
        openingDetailRef.current = false
      },
    })

    useEffect(() => {
      if (!combobox.dropdownOpened) setDetailResetKey((key) => key + 1)
    }, [combobox.dropdownOpened])

    useOverlayManager(combobox.dropdownOpened,()=>combobox.closeDropdown())

    const handleOptionSubmit = (val: string) => {
      const { provider, modelId } = JSON.parse(val) as { provider: string; modelId: string }
      onSelect?.(provider as ModelProvider, modelId)
      combobox.closeDropdown()
    }

    return (
      <Combobox
        store={combobox}
        width={280}
        position="top"
        middlewares={{flip:true,shift:true}}
        withinPortal={true}
        {...comboboxProps}
        portalProps={{ ...comboboxProps.portalProps, target: modalContent ?? comboboxProps.portalProps?.target }}
        onOptionSubmit={handleOptionSubmit}
      >
        <Combobox.Target ref={setTargetNode} targetType="button">
          <button ref={ref} onClick={() => combobox.toggleDropdown()} className="border-none bg-transparent p-0 flex">
            {children}
          </button>
        </Combobox.Target>

        <Combobox.Dropdown
          ref={setDropdownNode}
          className="!rounded-lg !border-[var(--chatbox-border-primary)] !shadow-lg"
          style={{ overflow: 'visible',maxWidth:'calc(100vw - 24px)',maxHeight:'min(480px, 70dvh)',display:combobox.dropdownOpened?'flex':'none',flexDirection:'column' }}
        >
          <Combobox.Search placeholder={t('Search') as string} aria-label={t('Search image models') as string} value={search} onChange={event=>setSearch(event.currentTarget.value)}/>
          <Combobox.Options data-model-scroll="native-images" style={{ minHeight:0,maxHeight:'min(400px, calc(70dvh - 64px))',overflowY: 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y',WebkitOverflowScrolling:'touch' }} data-vaul-no-drag className="p-1">
            {modelGroups.length === 0 ? (
              <Text size="sm" c="dimmed" px="sm" py="xs">
                {t('No models available')}
              </Text>
            ) : (
              modelGroups.map(group=>({...group,models:group.models.filter(model=>(group.label+' '+model.displayName+' '+model.modelId).toLowerCase().includes(search.toLowerCase()))})).filter(group=>group.models.length>0).map((group) => (
                <div key={group.providerId} data-image-provider={group.providerId}>
                  <ProviderGroupLabel providerId={group.providerId} name={group.label} isCustom={group.isCustom} />
                  {group.models.map((model) => {
                    const detail = getImageModelDetail(group, model)
                    const option = (
                      <Combobox.Option
                        key={`${group.providerId}:${model.modelId}`}
                        aria-label={model.displayName}
                        value={JSON.stringify({ provider: group.providerId, modelId: model.modelId })}
                        className="!rounded-lg flex items-center gap-2"
                      >
                        <ModelIcon
                          providerId={group.providerId}
                          modelId={model.modelId}
                          size={16}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1"><Text size="sm" className="break-words">{model.displayName}</Text>{group.providerId==='venice'&&<><Text size="xs" c="dimmed">{ft(imageVariant(model.vendorMetadata)||'Images')}{model.capabilities?.inputReferences?' · '+ft('Up to {{count}} reference images',{count:model.capabilities.inputReferences.max??1}):''}</Text><Text size="xs" c="dimmed" style={{overflowWrap:'anywhere'}}>{model.modelId}</Text><VeniceModelCost metadata={model.vendorMetadata}/></>}</div>
                        <VeniceModelBadges metadata={model.vendorMetadata} compact />
                        {(
                          <ActionIcon
                            aria-label={t('Model details') as string}
                            data-mantine-stop-propagation
                            variant="transparent"
                            size={isMobile ? 'lg' : 'md'}
                            className="shrink-0 text-chatbox-tint-tertiary hover:text-chatbox-tint-secondary"
                            onKeyDown={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.stopPropagation()
                              openingDetailRef.current = true
                              combobox.closeDropdown()
                              setMobileDetail(detail)
                            }}
                          >
                            <ScalableIcon icon={IconInfoCircle} size={15} />
                          </ActionIcon>
                        )}
                      </Combobox.Option>
                    )
                    if (isMobile || !detail.description) return option
                    return (
                      <HoverCard
                        key={`${group.providerId}:${model.modelId}:${detailResetKey}`}
                        id={`${selectorId}-${encodeURIComponent(JSON.stringify([group.providerId, model.modelId]))}`}
                        width={DESKTOP_DETAIL_CARD_OUTER_WIDTH}
                        position="right"
                        offset={DESKTOP_DETAIL_CARD_GAP}
                        openDelay={0}
                        closeDelay={120}
                        withinPortal
                        portalProps={{ target: dropdownNode || undefined }}
                      >
                        <HoverCard.Target>{option}</HoverCard.Target>
                        <HoverCard.Dropdown
                          className="!border-0 !bg-transparent !p-0 !shadow-none"
                          data-native-view-overlay
                        >
                          <DetailCard model={detail} />
                        </HoverCard.Dropdown>
                      </HoverCard>
                    )
                  })}
                </div>
              ))
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
        <ImageModelDetailDrawer
          model={mobileDetail}
          onClose={() => setMobileDetail(null)}
          onRestoreFocus={() => {
            if (targetNode?.isConnected) targetNode.focus({ preventScroll: true })
          }}
        />
      </Combobox>
    )
  }
)

ImageModelSelect.displayName = 'ImageModelSelect'

export default ImageModelSelect
