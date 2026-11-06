import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { Button, Stack } from '@mantine/core'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { forkT as ft } from '@/i18n/fork'
import { useTranslation } from 'react-i18next'
const UploadSource=NiceModal.create(({device,accept,multiple,onLocal}:{device:()=>void;accept?:string;multiple?:boolean;onLocal:(files:File[])=>void})=>{
 useTranslation();const modal=useModal()
 return <AdaptiveModal opened={modal.visible} onClose={()=>{modal.resolve();modal.hide()}} title={ft('Upload content')}><Stack><Button onClick={()=>{device();modal.resolve();modal.hide()}}>{ft('From this device')}</Button><Button variant="default" onClick={()=>{modal.resolve();modal.hide();void import('./LocalMediaPicker').then(({pickLocalMedia})=>pickLocalMedia({accept,multiple})).then(files=>{if(files.length)onLocal(files)})}}>{ft('From local library')}</Button></Stack></AdaptiveModal>
})
export function chooseUploadSource(input:{device:()=>void;accept?:string;multiple?:boolean;onLocal:(files:File[])=>void}){void NiceModal.show(UploadSource,input)}
