import { createFileRoute } from '@tanstack/react-router'
import { Button, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import Page from '@/components/layout/Page'
import { LocalMediaBrowser } from '@/components/local-library/LocalMediaBrowser'
import { forkT as ft } from '@/i18n/fork'
import { navigateToSettings } from '@/modals/settings-navigation'
export const Route=createFileRoute('/library/')({component:LibraryPage})
function LibraryPage(){useTranslation();return <Page title={ft('Local media library')}><Stack p="md" maw={1200} mx="auto"><LocalMediaBrowser browse/><Button variant="subtle" onClick={()=>navigateToSettings('/data')}>{ft('Cleanup and encrypted backups')}</Button></Stack></Page>}
