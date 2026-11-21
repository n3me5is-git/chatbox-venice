import { Alert, Button, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { ImageCapabilityBadges } from '@/components/venice/ImageCapabilityBadges'
import { VeniceModelBadges } from '@/components/venice/VeniceModelBadges'
import { forkT as ft } from '@/i18n/fork'
import type { resolveReferenceSelection } from './reference-selection'

export function ImageReferenceNotice({ review, onConfirm }: {
  review: NonNullable<ReturnType<typeof resolveReferenceSelection>['review']>
  onConfirm: () => void
}) {
  useTranslation()
  const [opened, setOpened] = useState(false)
  useEffect(() => setOpened(true), [review.key])

  return <>
    <Alert color="yellow" p="xs">
      <Button variant="subtle" size="compact-sm" onClick={() => setOpened(true)}>{ft('Review the selected model')}</Button>
    </Alert>
    <AdaptiveModal opened={opened} onClose={() => setOpened(false)} title={ft('Confirm a compatible image model')} size="sm" centered>
      <Stack gap="sm">
        <Text size="sm">{ft('The previous model cannot use all attached images. Confirm this model or choose another in the model list.')}</Text>
        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{review.candidate.displayName}</Text>
        <Text size="sm" c="dimmed">{review.providerLabel}</Text>
        {review.candidate.vendorMetadata?.veniceType
          ? <VeniceModelBadges metadata={review.candidate.vendorMetadata} />
          : <ImageCapabilityBadges capabilities={review.candidate.capabilities} />}
        {review.privacyChanged && <Alert color="yellow">{ft('Privacy or content filtering may differ for this model.')}</Alert>}
      </Stack>
      <AdaptiveModal.Actions>
        <Button variant="default" onClick={() => setOpened(false)}>{ft('Choose another model')}</Button>
        <Button onClick={onConfirm}>{ft('OK')}</Button>
      </AdaptiveModal.Actions>
    </AdaptiveModal>
  </>
}
