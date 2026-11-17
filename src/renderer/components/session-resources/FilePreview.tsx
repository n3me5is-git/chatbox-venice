import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { forkT as ft } from '@/i18n/fork'
import { SessionResources } from './SessionResources'
const Preview=NiceModal.create(({sessionId,path,resource}:{sessionId:string;path?:string;resource?:{id:string;key?:string}})=>{const modal=useModal();return <AdaptiveModal opened={modal.visible} onClose={()=>{modal.resolve();modal.remove()}} title={ft('Files and resources')} size="xl"><div style={{height:'76dvh'}}><SessionResources sessionId={sessionId} initialPath={path} initialResource={resource}/></div></AdaptiveModal>})
export function openSessionFilePreview(sessionId:string,path:string){void NiceModal.show(Preview,{sessionId,path})}
export function openSessionResourcePreview(sessionId:string,resource:{id:string;key?:string}){void NiceModal.show(Preview,{sessionId,resource})}
export async function tryOpenSessionFile(sessionId:string,paths:string[]){const {listSessionResources}=await import('@/packages/session-resources/service');const files=await listSessionResources(sessionId);const file=files.items.find(file=>file.path===paths[0]);if(!file)return false;openSessionFilePreview(sessionId,file.path);return true}
