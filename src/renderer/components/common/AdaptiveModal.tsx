import type { ModalProps as MantineModalProps } from '@mantine/core'
import { Button, type ButtonProps, Flex, Stack } from '@mantine/core'
import type { HTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { Modal, Drawer as ManagedDrawer } from '../layout/Overlay'

export interface AdaptiveModalProps extends Omit<MantineModalProps, 'opened' | 'onClose'> {
  opened: boolean
  onClose: () => void
}

export function AdaptiveModal({ opened, onClose, onExitTransitionEnd, children, title, ...props }: AdaptiveModalProps) {
  const isSmallScreen = useIsSmallScreen()

  if (isSmallScreen) {
    return (
      <ManagedDrawer opened={opened} onClose={onClose} title={title} position="bottom" size="auto"
        onExitTransitionEnd={onExitTransitionEnd} closeOnEscape={props.closeOnEscape} closeOnClickOutside={props.closeOnClickOutside}
        styles={{content:{maxHeight:'92dvh',display:'flex',flexDirection:'column',borderRadius:'16px 16px 0 0'},
          header:{flexShrink:0},body:{minHeight:0,overflowY:'auto',overscrollBehavior:'contain',touchAction:'pan-y',paddingBottom:'max(16px, env(safe-area-inset-bottom))'}}}>
        {children}
      </ManagedDrawer>
    )
  }

  return (
    <Modal opened={opened} onClose={onClose} onExitTransitionEnd={onExitTransitionEnd} title={title} {...props}>
      {children}
    </Modal>
  )
}

function AdaptiveModalActions({ children }: { children: ReactNode }) {
  const isSmallScreen = useIsSmallScreen()

  if (isSmallScreen) {
    return (
      <Stack gap="xs" mt="md" className="flex-col-reverse">
        {children}
      </Stack>
    )
  }

  return (
    <Flex gap="md" mt="md" justify="flex-end" align="center">
      {children}
    </Flex>
  )
}

AdaptiveModal.Actions = AdaptiveModalActions

function AdaptiveModalCloseButton(props: ButtonProps & HTMLAttributes<HTMLButtonElement>) {
  const isSmallScreen = useIsSmallScreen()
  const { t } = useTranslation()
  if (isSmallScreen) {
    return null
  }

  return (
    <Button color="chatbox-gray" variant="light" {...props}>
      {props.children || t('Cancel')}
    </Button>
  )
}

AdaptiveModal.CloseButton = AdaptiveModalCloseButton
