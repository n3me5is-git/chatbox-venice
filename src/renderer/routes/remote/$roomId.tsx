import { createFileRoute,useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { PageHeader } from '@/components/layout/Page'
import { RemoteChat } from '@/components/collaboration/RemoteChat'
import { openCollaboration } from '@/components/collaboration/CollaborationButton'
export const Route=createFileRoute('/remote/$roomId')({component:RemoteChatRoute})
function RemoteChatRoute(){
  useTranslation();const {roomId}=Route.useParams(),navigate=useNavigate()
  return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}><PageHeader title={ft('Remote chat')}/><div style={{flex:1,minHeight:0}}><RemoteChat key={roomId} roomId={roomId} onManage={()=>void openCollaboration(undefined,roomId)} onLeave={()=>void navigate({to:'/'})}/></div></div>
}
