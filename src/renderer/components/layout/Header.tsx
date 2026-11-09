import type { SessionHeader } from '@chatbox/core/ports'
import { Flex, Text, UnstyledButton } from '@mantine/core'
import { TestId } from '@shared/automation/testids'
import { IconChevronDown, IconPencil, IconPlus } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { syncSessionAutoTitleOnOpen } from '@/stores/session/naming'
import { uiStore } from '@/stores/uiStore'
import { ICON_SIZE, ICON_STROKE_WIDTH, IconButton } from '../common/IconButton'
import { ScalableIcon } from '../common/ScalableIcon'
import { PageHeader } from './Page'
import Toolbar, { SessionMenu } from './Toolbar'
import { SessionResourcesButton } from '@/components/session-resources/SessionResourcesButton'
import { CollaborationButton } from '@/components/collaboration/CollaborationButton'
import { SessionRagButton } from '@/components/session-resources/SessionRagButton'
import { MultiAgentButton } from '@/components/multi-agent/MultiAgentButton'

export default function Header(props: { session: SessionHeader }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isSmallScreen = useIsSmallScreen()

  const { session: currentSession } = props
  const visibleSessionId = currentSession.id

  // biome-ignore lint/correctness/useExhaustiveDependencies: run opening-time naming only when the visible session id changes
  useEffect(() => {
    let active = true
    void syncSessionAutoTitleOnOpen(currentSession, () => active)
    return () => {
      active = false
    }
  }, [visibleSessionId])

  const editCurrentSession = () => {
    if (!currentSession) {
      return
    }
    uiStore.getState().openSessionPanel(currentSession.id, 'settings')
  }

  if (isSmallScreen) {
    return (
      <PageHeader
        title={
          <SessionMenu session={currentSession} onEditSettings={editCurrentSession}>
            <UnstyledButton className="controls min-w-0" data-testid={TestId.session.headerMenuTrigger}>
              <Flex align="center" gap={4} miw={0}>
                <Text component="span" fw={600} fz={16} lh="24px" truncate="end" className="min-w-0">
                  {currentSession?.name}
                </Text>
                <ScalableIcon
                  icon={IconChevronDown}
                  size={ICON_SIZE.inline}
                  strokeWidth={ICON_STROKE_WIDTH}
                  className="shrink-0 text-chatbox-tertiary"
                />
              </Flex>
            </UnstyledButton>
          </SessionMenu>
        }
        right={
          <Flex align="center" gap={2} wrap="nowrap" style={{maxWidth:'60vw',overflowX:'auto',minWidth:0}}>{!currentSession.settings?.multiAgentRun&&<SessionRagButton sessionId={currentSession.id}/>} {currentSession.settings?.agentMode?.value === 'on' && !currentSession.settings?.multiAgentRun && <MultiAgentButton sessionId={currentSession.id}/>}<CollaborationButton sessionId={currentSession.id}/><SessionResourcesButton sessionId={currentSession.id}/><IconButton
            icon={IconPlus}
            size="lg"
            iconSize={ICON_SIZE.touch}
            aria-label={t('New Chat')}
            onClick={() => navigate({ to: '/' })}
          /></Flex>
        }
      />
    )
  }

  return (
    <PageHeader
      title={
        <Flex align="center" miw={0}>
          <Text component="h1" m={0} fw={600} fz={14} lh="20px" truncate="end" className="min-w-0">
            {currentSession?.name}
          </Text>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                className="controls"
                icon={IconPencil}
                iconSize={ICON_SIZE.inline}
                color="chatbox-tertiary"
                ml={4}
                aria-label={t('Customize settings for the current conversation')}
                onClick={editCurrentSession}
              />
            </TooltipTrigger>
            <TooltipContent>{t('Customize settings for the current conversation')}</TooltipContent>
          </Tooltip>
        </Flex>
      }
      right={<Flex align="center" gap="xs">{!currentSession.settings?.multiAgentRun&&<SessionRagButton sessionId={currentSession.id}/>} {currentSession.settings?.agentMode?.value === 'on' && !currentSession.settings?.multiAgentRun && <MultiAgentButton sessionId={currentSession.id}/>}<CollaborationButton sessionId={currentSession.id}/><SessionResourcesButton sessionId={currentSession.id}/><Toolbar session={currentSession} /></Flex>}
    />
  )
}
