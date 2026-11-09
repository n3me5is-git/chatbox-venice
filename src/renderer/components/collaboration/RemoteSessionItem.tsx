import { useOverlayManager } from '@/components/layout/Overlay'
import { ActionIcon,Group,Menu,Stack,Text,UnstyledButton } from '@mantine/core'
import { IconCloud,IconDots,IconLogout,IconSettings } from '@tabler/icons-react'
import { useRouterState,useNavigate } from '@tanstack/react-router'
import { useTouchLayout } from '@/hooks/useTouchLayout'
import { useSidebarContextMenu } from '@/components/session/useSidebarContextMenu'
import { useUIStore } from '@/stores/uiStore'
import { remoteSessions } from '@/packages/collaboration/remote-sessions'
import { openCollaboration } from './CollaborationButton'
import { forkT as ft } from '@/i18n/fork'
import type { GuestShare } from '@/packages/collaboration/hub'
const remoteStatus=(room:GuestShare)=>ft({connecting:'Connecting…',waiting:'Waiting for owner approval',connected:'Connected',disconnected:'Disconnected'}[room.status])

export function RemoteSessionItem({room}:{room:GuestShare}){
  const navigate=useNavigate(),path=useRouterState({select:state=>state.location.pathname}),selected=path==='/remote/'+room.id,touch=useTouchLayout(),menu=useSidebarContextMenu({touchLayout:touch}),setShowSidebar=useUIStore(state=>state.setShowSidebar)
  useOverlayManager(menu.menuOpened,()=>menu.handleMenuChange(false))
  return <Menu opened={menu.menuOpened} onChange={menu.handleMenuChange} withinPortal={false} position="bottom-end"><Group gap={2} mx="xs" px="xs" className="rounded-md" style={{background:selected?'var(--mantine-color-default-hover)':undefined}} onContextMenu={menu.handleContextMenu} onPointerDown={menu.handlePointerDown} onPointerMove={menu.handlePointerMove} onPointerUp={menu.clearLongPressTimer} onPointerCancel={menu.clearLongPressTimer} onPointerLeave={menu.clearLongPressTimer}>
    <UnstyledButton data-remote-session={room.id} aria-current={selected?'page':undefined} style={{flex:1,minWidth:0,padding:'8px 0'}} onClick={()=>{if(menu.consumeClick())return;remoteSessions.open(room.id);if(touch)setShowSidebar(false)}}><Group gap="xs" wrap="nowrap"><IconCloud size={18} aria-label={ft('Remote session')} style={{flexShrink:0}}/><Stack gap={0} style={{minWidth:0}}><Text size="sm" truncate>{room.snapshot?.title||ft('Remote chat')}</Text><Text size="xs" c="dimmed" truncate>{remoteStatus(room)}</Text></Stack></Group></UnstyledButton>
    <Menu.Target><ActionIcon variant="subtle" aria-label={ft('Remote chat actions')} onPointerDown={event=>event.stopPropagation()}><IconDots size={16}/></ActionIcon></Menu.Target>
  </Group><Menu.Dropdown><Menu.Item leftSection={<IconSettings size={16}/>} onClick={()=>{void openCollaboration(undefined,room.id);if(touch)setShowSidebar(false)}}>{ft('Manage connection')}</Menu.Item><Menu.Item color="red" leftSection={<IconLogout size={16}/>} onClick={()=>{remoteSessions.leave(room.id);if(selected)void navigate({to:'/'})}}>{ft('Leave shared chat')}</Menu.Item></Menu.Dropdown></Menu>
}
