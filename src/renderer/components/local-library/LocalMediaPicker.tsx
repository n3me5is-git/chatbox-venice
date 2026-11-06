import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { LocalMediaBrowser } from './LocalMediaBrowser'
export const LocalMediaPicker=NiceModal.create(({accept='',multiple=false}:{accept?:string;multiple?:boolean})=>{
 useTranslation();const modal=useModal();usePrivacyDismiss(modal,[])
 return <AdaptiveModal opened={modal.visible} onClose={()=>{modal.resolve([]);modal.hide()}} title={ft('Choose from local library')} size="lg"><LocalMediaBrowser accept={accept} multiple={multiple} onChoose={files=>{modal.resolve(files);modal.hide()}}/></AdaptiveModal>
})
export async function pickLocalMedia(options:{accept?:string;multiple?:boolean}={}) {return NiceModal.show(LocalMediaPicker,options) as Promise<File[]>}
