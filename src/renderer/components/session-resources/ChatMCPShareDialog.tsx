import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { forkT as ft } from '@/i18n/fork'
import { LocalMCPSettings } from './LocalMCPSettings'

export const ChatMCPShareDialog = NiceModal.create(({ sessionId }: { sessionId: string }) => {
  useTranslation()
  const modal = useModal()
  usePrivacyDismiss(modal, undefined)
  const path = useRouterState({ select: state => state.location.pathname })
  useEffect(() => {
    if (path !== `/session/${sessionId}`) modal.remove()
  }, [modal, path, sessionId])

  return (
    <AdaptiveModal opened={modal.visible} onClose={() => void modal.hide()} onExitTransitionEnd={modal.remove}
      size="lg" title={ft('Share this chat through MCP')}>
      <LocalMCPSettings key={sessionId} sessionId={sessionId} />
    </AdaptiveModal>
  )
})
