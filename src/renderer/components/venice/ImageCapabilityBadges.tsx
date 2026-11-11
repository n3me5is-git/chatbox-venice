import { Badge, Group } from '@mantine/core'
import { IconPhoto, IconPhotoEdit } from '@tabler/icons-react'
import type { ImageModelCapabilities } from '@shared/types'
import { getVeniceImageCapabilities } from '@shared/providers/definitions/models/venice/image-request'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'

export function ImageCapabilityBadges({metadata,capabilities,editing=false}:{metadata?:Record<string,unknown>;capabilities?:ImageModelCapabilities;editing?:boolean}) {
  useTranslation()
  const veniceImage=['image','inpaint'].includes(String(metadata?.veniceType))
  const refs=(capabilities||(veniceImage?getVeniceImageCapabilities({modelId:'',vendorMetadata:metadata}):undefined))?.inputReferences
  const edit=editing||metadata?.veniceType==='inpaint'
  const style=metadata?.veniceType==='image'&&!!refs
  if(!refs&&!edit)return null
  return <Group gap={4} wrap="wrap">
    {refs&&<Badge size="xs" variant="light" color="cyan" leftSection={<IconPhoto size={12}/>} title={ft('Up to {{count}} reference images',{count:refs.max??1})}>{ft(style?'Style references':'References')} · {refs.max??1}</Badge>}
    {edit&&<Badge size="xs" variant="light" color="violet" leftSection={<IconPhotoEdit size={12}/>}>{ft('Image editing')}</Badge>}
  </Group>
}
