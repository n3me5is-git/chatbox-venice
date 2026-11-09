import {useOverlayManager,Drawer as ManagedDrawer} from '@/components/layout/Overlay'
import {VeniceModelCost} from '@/components/venice/VeniceModelCost'
import { VeniceModelBadges } from '@/components/venice/VeniceModelBadges'
import { ActionIcon, Box, Flex, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import type { ImageGeneration } from '@shared/types'
import { IconInfoCircle, IconPlus, IconServer } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Drawer } from 'vaul'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { getImageModelDetail, ImageModelDetailDrawer } from '@/components/ImageModelDetails'
import { ModelIcon } from '@/components/icons/ModelIcon'
import ProviderIcon from '@/components/icons/ProviderIcon'
import type { DetailModel } from '@/components/ModelSelectorV2/types'
import type { ImageModelGroup } from '@/hooks/useImageModelGroups'
import { HistoryListContent } from './HistoryPanel'

/* ============================================
   Mobile History Drawer
   ============================================ */

export interface MobileHistoryDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  historyCache: ImageGeneration[]
  historyLoading: boolean
  currentRecordId: string | null
  getModelDisplayName: (record: ImageGeneration) => string
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onItemClick: (record: ImageGeneration) => void
  onLoadMore: () => void
  onNewCreation: () => void
  onDelete: (id: string) => void
}

export function MobileHistoryDrawer({
  open,
  onOpenChange,
  historyCache,
  historyLoading,
  currentRecordId,
  getModelDisplayName,
  hasNextPage,
  isFetchingNextPage,
  onItemClick,
  onLoadMore,
  onNewCreation,
  onDelete,
}: MobileHistoryDrawerProps) {
  const { t } = useTranslation()
  useOverlayManager(open,()=>onOpenChange(false))

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} noBodyStyles>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-chatbox-background-mask-overlay" />
        <Drawer.Content className="flex flex-col rounded-t-xl h-[70vh] fixed bottom-0 left-0 right-0 outline-none bg-[var(--chatbox-background-primary)]">
          <Drawer.Handle />
          <Flex
            align="center"
            justify="space-between"
            px="md"
            py="sm"
            className="border-b border-[var(--chatbox-border-primary)]"
          >
            <Drawer.Title asChild>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.5 }}>
                {t('History')}
              </Text>
            </Drawer.Title>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => {
                onNewCreation()
                onOpenChange(false)
              }}
            >
              <IconPlus size={16} />
            </ActionIcon>
          </Flex>

          <Box flex={1} mih={0}>
            <HistoryListContent
              historyCache={historyCache}
              historyLoading={historyLoading}
              currentRecordId={currentRecordId}
              getModelDisplayName={getModelDisplayName}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isMobile
              onItemClick={(record) => {
                onItemClick(record)
                onOpenChange(false)
              }}
              onLoadMore={onLoadMore}
              onDelete={onDelete}
            />
          </Box>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/* ============================================
   Mobile Model Drawer
   ============================================ */

export interface MobileModelDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelGroups: ImageModelGroup[]
  selectedProvider: string
  selectedModel: string
  onSelect: (provider: string, model: string) => void
}

export function MobileModelDrawer({
  open,
  onOpenChange,
  modelGroups,
  selectedProvider,
  selectedModel,
  onSelect,
}: MobileModelDrawerProps) {
  const { t } = useTranslation()
  useOverlayManager(open,()=>onOpenChange(false))
  const [search,setSearch]=useState('')
  const [detail, setDetail] = useState<DetailModel | null>(null)
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null)

  return (
    <ManagedDrawer trapFocus={!detail} opened={open} onClose={()=>onOpenChange(false)} position="bottom" size="auto" title={t('Select Model')} styles={{content:{height:'min(78dvh, 720px)',maxHeight:'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)',display:'flex',flexDirection:'column',borderRadius:'16px 16px 0 0'},body:{flex:'1 1 0',minHeight:0,display:'flex',flexDirection:'column',overflow:'hidden',padding:0}}}>
      <TextInput m="sm" placeholder={t('Search')} aria-label={t('Search image models')} value={search} onChange={event=>setSearch(event.currentTarget.value)} styles={{root:{flexShrink:0}}}/>
          <Box flex={1} mih={0} data-model-scroll="image" style={{ minHeight:0,flex:1,overflowY: 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }} data-vaul-no-drag>
            <Stack gap="md" p="xs" pb="xl" style={{paddingBottom:'max(24px, env(safe-area-inset-bottom))'}}>
              {modelGroups.map(group=>({...group,models:group.models.filter(model=>(group.label+' '+model.displayName+' '+model.modelId).toLowerCase().includes(search.toLowerCase()))})).filter(group=>group.models.length>0).map((group, groupIndex) => (
                <Stack key={group.providerId} data-image-provider={group.providerId} gap={2} style={{flexShrink:0}}>
                  <Flex align="center" gap={6} px="sm">
                    {group.isCustom ? (
                      <ScalableIcon icon={IconServer} size={14} className="text-chatbox-tint-gray" />
                    ) : (
                      <ProviderIcon size={14} provider={group.providerId} className="opacity-50" />
                    )}
                    <Text size="xs" fw={500} c="dimmed">
                      {group.label}
                    </Text>
                  </Flex>
                  {group.models.map((model) => {
                    const isSelected = selectedProvider === group.providerId && selectedModel === model.modelId
                    return (
                      <Flex
                        key={`${group.providerId}:${model.modelId}`}
                        align="center"
                        className={`
                          w-full rounded-lg transition-colors
                          ${isSelected ? 'bg-[var(--chatbox-background-brand-secondary)]' : 'hover:bg-[var(--chatbox-background-secondary)]'}
                        `}
                      >
                        <UnstyledButton
                          className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3"
                          onClick={() => {
                            onSelect(group.providerId, model.modelId)
                            onOpenChange(false)
                          }}
                        >
                          <ModelIcon
                            providerId={group.providerId}
                            modelId={model.modelId}
                            size={20}
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1"><Text size="sm" fw={isSelected ? 600 : 400} className="break-words">{model.displayName}</Text>{group.providerId==='venice'&&<><Text size="xs" c="dimmed" style={{overflowWrap:'anywhere'}}>{model.modelId}</Text><VeniceModelCost metadata={model.vendorMetadata}/></>}</div>
                          <VeniceModelBadges metadata={model.vendorMetadata} compact />
                        </UnstyledButton>
                        {(
                          <ActionIcon
                            aria-label={t('Model details') as string}
                            variant="transparent"
                            size="sm"
                            className="mr-4 shrink-0 text-chatbox-tint-tertiary hover:text-chatbox-tint-secondary"
                            onClick={(event) => {
                              detailTriggerRef.current = event.currentTarget
                              setDetail(getImageModelDetail(group, model))
                            }}
                          >
                            <ScalableIcon icon={IconInfoCircle} size={15} />
                          </ActionIcon>
                        )}
                      </Flex>
                    )
                  })}
                  {groupIndex < modelGroups.length - 1 && (
                    <div className="h-px bg-[var(--chatbox-border-primary)] mx-2 mt-2" />
                  )}
                </Stack>
              ))}
            </Stack>
          </Box>

      <ImageModelDetailDrawer
        model={detail}
        onClose={() => setDetail(null)}
        onRestoreFocus={() => {
          if (detailTriggerRef.current?.isConnected) detailTriggerRef.current.focus({ preventScroll: true })
        }}
      />
    </ManagedDrawer>
  )
}

/* ============================================
   Mobile Ratio Drawer
   ============================================ */

export interface MobileRatioDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: string[]
  selectedRatio: string
  onSelect: (ratio: string) => void
}

export function MobileRatioDrawer({ open, onOpenChange, options, selectedRatio, onSelect }: MobileRatioDrawerProps) {
  const { t } = useTranslation()
  useOverlayManager(open,()=>onOpenChange(false))

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} noBodyStyles>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-chatbox-background-mask-overlay" />
        <Drawer.Content className="flex flex-col rounded-t-xl fixed bottom-0 left-0 right-0 outline-none bg-[var(--chatbox-background-primary)]">
          <Drawer.Handle />
          <Flex
            align="center"
            justify="space-between"
            px="md"
            py="sm"
            className="border-b border-[var(--chatbox-border-primary)]"
          >
            <Drawer.Title asChild>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.5 }}>
                {t('Aspect Ratio')}
              </Text>
            </Drawer.Title>
          </Flex>

          <Stack gap={2} p="xs" pb="xl">
            {options.map((ratio) => (
              <UnstyledButton
                key={ratio}
                onClick={() => {
                  onSelect(ratio)
                  onOpenChange(false)
                }}
                className={`
                  w-full px-4 py-3 rounded-lg transition-colors
                  ${selectedRatio === ratio ? 'bg-[var(--chatbox-background-brand-secondary)]' : 'hover:bg-[var(--chatbox-background-secondary)]'}
                `}
              >
                <Text size="sm" fw={selectedRatio === ratio ? 600 : 400} ta="center">
                  {ratio}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
