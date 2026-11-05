import type { useModal } from '@ebay/nice-modal-react'
import { useEffect,useRef } from 'react'
/** Pending dialogs must not survive a privacy lock or a gated provider unmount. */
export function usePrivacyDismiss(modal:ReturnType<typeof useModal>,result:unknown){
  const current=useRef({modal,result});current.current={modal,result}
  useEffect(()=>{const close=()=>{current.current.modal.resolve(current.current.result);current.current.modal.remove()};window.addEventListener('chatbox:privacy-lock',close);return()=>{window.removeEventListener('chatbox:privacy-lock',close);current.current.modal.resolve(current.current.result)}},[])
}
export function dismissPrivateSurfaces(){window.dispatchEvent(new Event('chatbox:privacy-lock'))}
