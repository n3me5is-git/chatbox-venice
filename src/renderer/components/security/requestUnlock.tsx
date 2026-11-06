import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { ScopeUnlock } from './ScopeUnlock'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { forkT as ft } from '@/i18n/fork'
import { usePrivacyDismiss } from './usePrivacyDismiss'
const UnlockModal=NiceModal.create(({scope}:{scope:string})=>{
 const modal=useModal();usePrivacyDismiss(modal,false)
 return <AdaptiveModal opened={modal.visible} onClose={()=>{modal.resolve(false);modal.hide()}} title={ft('Unlock protected content')}><ScopeUnlock keys={vaultRuntimeFor(platform).keys} scope={scope} onUnlocked={()=>{modal.resolve(true);modal.hide()}}/></AdaptiveModal>
})
/** Re-authenticate a preview even when an active generation still needs the scope key. */
export const requestProtectedAccess=(scope='app')=>NiceModal.show(UnlockModal,{scope}) as Promise<boolean>
