import {useTranslation} from 'react-i18next'
import {forkT as ft} from '@/i18n/fork'
import { Badge, Group } from '@mantine/core'
import { IconEyeOff, IconLock, IconShield, IconShieldOff } from '@tabler/icons-react'
import { privacyLabels } from '@shared/providers/definitions/models/venice/media-capabilities'
export function VeniceModelBadges({ metadata, compact = false }: { metadata?: Record<string, unknown>; compact?: boolean }) {
  useTranslation()
  const icons = { private: IconShield, anonymous: IconEyeOff, encrypted: IconLock, filter: IconShieldOff }
  return <Group gap={4} wrap="wrap">{privacyLabels(metadata).map(item => { const Icon = icons[item.icon]; return <Badge key={item.label} size="xs" variant="light" title={ft(item.description)} aria-label={ft(item.label)} leftSection={<Icon size={12} />}>{compact ? null : ft(item.label)}</Badge> })}</Group>
}

