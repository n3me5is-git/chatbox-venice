import {useEffect,useState} from 'react'
import {Button} from '@mantine/core'
import {useTranslation} from 'react-i18next'
import {AdaptiveModal} from '@/components/common/AdaptiveModal'
import {syncSessionApprovalScope} from '@/packages/venice/approval-scope'
import {useProviderSettings} from '@/stores/settingsStore'
import {VeniceSessionApprovals,useSessionApprovalMode} from './VeniceSessionApprovals'

export function VeniceSessionApprovalButton({sessionId}: {sessionId:string}) {
  const {t}=useTranslation(); const mode=useSessionApprovalMode(sessionId); const [opened,setOpened]=useState(false)
  const {providerSettings}=useProviderSettings('venice')
  useEffect(()=>{syncSessionApprovalScope(sessionId)},[sessionId,providerSettings])
  return <><Button size="xs" variant="subtle" onClick={()=>setOpened(true)}>{t('Venice approvals')}: {t(mode==='automatic'?'Automatic':mode==='similar'?'Similar requests':'Ask every time')}</Button><AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title={t('Venice approvals')}><VeniceSessionApprovals sessionId={sessionId}/></AdaptiveModal></>
}
