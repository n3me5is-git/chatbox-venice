import NiceModal from '@ebay/nice-modal-react'
import { ActionIcon } from '@mantine/core'
import { IconHierarchy } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
export function MultiAgentButton({ sessionId }: { sessionId: string }) { useTranslation(); return <ActionIcon size="lg" variant="subtle" aria-label={ft('Multi-agent work')} title={ft('Multi-agent work')} onClick={() => void import('./MultiAgentPanel').then(module => NiceModal.show(module.MultiAgentPanel, { sessionId }))}><IconHierarchy size={20}/></ActionIcon> }
