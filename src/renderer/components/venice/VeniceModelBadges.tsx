import {useTranslation} from 'react-i18next'
import {forkT as ft} from '@/i18n/fork'
import { Badge, Group } from '@mantine/core'
import { IconEyeOff, IconLock, IconShield, IconShieldOff, IconHelpCircle } from '@tabler/icons-react'
import { privacyLabels } from '@shared/providers/definitions/models/venice/media-capabilities'
import { ImageCapabilityBadges } from './ImageCapabilityBadges'
export function VeniceModelBadges({ metadata, compact = false, showUnknown = false }: { metadata?: Record<string, unknown>; compact?: boolean;showUnknown?:boolean }) {
  useTranslation()
  const icons = { private: IconShield, anonymous: IconEyeOff, encrypted: IconLock, filter: IconShieldOff, unknown:IconHelpCircle }
  const badges:{label:string;description:string;icon:keyof typeof icons}[]=privacyLabels(metadata)
  if(metadata&&(showUnknown||metadata.veniceType)&&!['private','anonymized','anonymous','e2ee','tee'].includes(String(metadata.privacy)))badges.push({label:'Privacy not declared',description:'The provider has not declared the privacy level of this model.',icon:'unknown'})
  if(metadata&&(showUnknown||metadata.veniceType)&&!badges.some(item=>item.icon==='filter'))badges.push({label:'Filter not declared',description:'Venice does not declare whether this model is uncensored.',icon:'filter'})
  return <Group gap={4} wrap="wrap">{badges.map(item => { const Icon = icons[item.icon]; return <Badge key={item.label} size="xs" color={item.label==='Filter not declared'||item.icon==='unknown'?'gray':undefined} variant="light" title={ft(item.description)} aria-label={ft(item.label)} leftSection={<Icon size={12} />}>{compact ? null : ft(item.label)}</Badge> })}<ImageCapabilityBadges metadata={metadata}/></Group>
}

