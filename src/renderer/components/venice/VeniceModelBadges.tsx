import { Badge, Group } from '@mantine/core'
import { IconEyeOff, IconLock, IconShield, IconShieldOff } from '@tabler/icons-react'
import { privacyLabels } from '@shared/providers/definitions/models/venice/media-capabilities'
export function VeniceModelBadges({ metadata, compact = false }: { metadata?: Record<string, unknown>; compact?: boolean }) {
  const icons = { private: IconShield, anonymous: IconEyeOff, encrypted: IconLock, filter: IconShieldOff }
  return <Group gap={4} wrap="nowrap">{privacyLabels(metadata).map(item => { const Icon = icons[item.icon]; return <Badge key={item.label} size="xs" variant="light" title={item.description} aria-label={item.label} leftSection={<Icon size={12} />}>{compact ? null : item.label}</Badge> })}</Group>
}
