import {useOverlayManager} from '@/components/layout/Overlay'
import { ActionIcon, Button, Flex, Image, Menu, Popover, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core'
import type { ImageGeneration } from '@shared/types'
import { IconDots, IconPhoto, IconPhotoOff, IconTrash } from '@tabler/icons-react'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { useBlob } from '@/hooks/useBlob'
import { blobToDataUrl, isDirectImageSource } from './constants'

export interface HistoryItemProps {
  record: ImageGeneration
  isActive: boolean
  isMobile?: boolean
  modelDisplayName: string
  onClick: () => void
  onDelete: (id: string) => void
}

export function HistoryItem({ record, isActive, isMobile, modelDisplayName, onClick, onDelete }: HistoryItemProps) {
  const { t } = useTranslation()
  const [deletePopoverOpened, setDeletePopoverOpened] = useState(false)
  const [actionsOpened,setActionsOpened]=useState(false)
  useOverlayManager(actionsOpened,()=>setActionsOpened(false))
  const hold=useRef<ReturnType<typeof setTimeout>|null>(null),held=useRef(false)
  const stopHold=()=>{if(hold.current)clearTimeout(hold.current);hold.current=null}
  const changeProtection=async()=>{
    const [{requestProtectedAccess},{default:platform},{queryClient}]=await Promise.all([import('@/components/security/requestUnlock'),import('@/platform'),import('@/stores/queryClient')])
    if(!await requestProtectedAccess(record.protection||'app'))return
    try{await platform.getImageGenerationStorage().update(record.id,{protection:record.protection?undefined:'app'});await queryClient.invalidateQueries()}
    catch{const {add}=await import('@/stores/toastActions');add(ft('Unable to update creation protection'))}
  }
  const firstImage = record.generatedImages[0]
  const firstThumbnail = record.generatedImageThumbnails?.find((thumbnail,index)=>thumbnail&&thumbnail!==record.generatedImages[index])

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isMobile) {
        if (window.confirm(t('Delete this record?') ?? '')) {
          onDelete(record.id)
        }
      } else {
        setDeletePopoverOpened(true)
      }
    },
    [isMobile, onDelete, record.id, t]
  )

  const handleConfirmDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete(record.id)
      setDeletePopoverOpened(false)
    },
    [onDelete, record.id]
  )

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletePopoverOpened(false)
  }, [])

  return (
    <Stack gap={4} className="w-full">
      {/* Thumbnail — clickable */}
      <UnstyledButton
        aria-label={ft('Preview {{name}}',{name:record.prompt||ft('Locked creation')})}
        onClick={()=>{if(held.current){held.current=false;return}onClick()}}
        onContextMenu={event=>{event.preventDefault();setActionsOpened(true)}}
        onPointerDown={()=>{held.current=false;hold.current=setTimeout(()=>{held.current=true;setActionsOpened(true)},550)}}
        onPointerUp={stopHold} onPointerCancel={stopHold} onPointerMove={stopHold}
        style={{ borderWidth: 1, borderStyle: 'solid' }}
        className={`w-full aspect-square rounded-lg overflow-hidden transition-colors duration-150 ${
          isActive
            ? 'border-[var(--chatbox-tint-brand)]'
            : 'border-[var(--chatbox-border-primary)] hover:border-[var(--chatbox-border-secondary)]'
        }`}
      >
        {firstThumbnail ? (
          <HistoryThumbnail storageKey={firstThumbnail} />
        ) : (
          <Flex align="center" justify="center" h="100%" className="bg-[var(--chatbox-background-secondary)]">
            <IconPhoto size={24} className="opacity-20" />
          </Flex>
        )}
      </UnstyledButton>

      {/* Prompt + Model name + Date + Delete */}
      <Flex align="center" justify="space-between" gap={4} px={2}>
        {record.protection&&<Text size="xs" c="dimmed">{record.protectedRecord?ft('Locked creation'):ft('Protected creation')}</Text>}
        {record.prompt && (
          <Text size={isMobile ? 'sm' : 'xs'} lineClamp={1} title={record.prompt}>
            {record.prompt}
          </Text>
        )}
      </Flex>
      <Flex align="center" justify="space-between" gap={4} px={2}>
        <Stack gap={0} style={{ flex: 1, overflow: 'hidden' }}>
          <Text size={isMobile ? 'sm' : 'xs'} c="gray.7" lineClamp={1}>
            {modelDisplayName}
          </Text>
          {isMobile && (
            <Text size="xs" c="dimmed">
              {new Date(record.createdAt).toLocaleDateString()}
            </Text>
          )}
        </Stack>

        <Menu opened={actionsOpened} onChange={setActionsOpened} withinPortal={false} position="bottom-end"><Menu.Target><ActionIcon size="sm" variant="subtle" aria-label={ft('Creation actions')} onClick={()=>setActionsOpened(value=>!value)}><IconDots size={16}/></ActionIcon></Menu.Target><Menu.Dropdown><Menu.Item onClick={onClick}>{ft('Open preview')}</Menu.Item><Menu.Item onClick={()=>void changeProtection()}>{record.protection?ft('Make this creation public'):ft('Protect this creation')}</Menu.Item><Menu.Item color="red" onClick={()=>{if(window.confirm(t('Delete this record?')||''))onDelete(record.id)}}>{ft('Delete from device')}</Menu.Item></Menu.Dropdown></Menu>
        {isMobile ? (
          <ActionIcon
            variant="transparent"
            color="gray"
            size="sm"
            onClick={handleDeleteClick}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <IconTrash size={16} />
          </ActionIcon>
        ) : (
          <Popover
            opened={deletePopoverOpened}
            onClose={() => setDeletePopoverOpened(false)}
            position="left"
            withArrow
            shadow="md"
            radius="lg"
          >
            <Popover.Target>
              <ActionIcon
                variant="transparent"
                color="gray"
                size="xs"
                onClick={handleDeleteClick}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <IconTrash size={12} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="xs">
                <Text size="sm">{t('Delete this record?')}</Text>
                <Flex gap="xs" justify="flex-end">
                  <Button size="xs" variant="default" onClick={handleCancelDelete}>
                    {t('Cancel')}
                  </Button>
                  <Button size="xs" color="red" onClick={handleConfirmDelete}>
                    {t('Delete')}
                  </Button>
                </Flex>
              </Stack>
            </Popover.Dropdown>
          </Popover>
        )}
      </Flex>
    </Stack>
  )
}

interface HistoryThumbnailProps {
  storageKey: string
}

function HistoryThumbnail({ storageKey }: HistoryThumbnailProps) {
  const isDirectSource = isDirectImageSource(storageKey)
  const { data: blob, isError } = useBlob(isDirectSource ? undefined : storageKey)
  const imageUrl = isDirectSource ? storageKey : blob ? blobToDataUrl(blob) : null

  if (isError) {
    return (
      <Flex align="center" justify="center" h="100%" className="bg-[var(--chatbox-background-tertiary)]">
        <IconPhotoOff size={20} className="opacity-30" />
      </Flex>
    )
  }

  if (!imageUrl) {
    return <Skeleton h="100%" w="100%" radius={0} />
  }

  return <Image src={imageUrl} h="100%" w="100%" fit="cover" radius={0} />
}
