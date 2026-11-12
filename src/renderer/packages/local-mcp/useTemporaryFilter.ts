import {useEffect,useState} from 'react'
import platform from '@/platform'
import {temporaryMCPSessionIds} from './temporary'
export function useTemporaryMCPFilter(){
  const [ids,setIds]=useState<Set<string>|null>(platform.type==='desktop'?null:new Set())
  useEffect(()=>{let active=true;const refresh=()=>{void temporaryMCPSessionIds().then(value=>{if(active)setIds(value)}).catch(()=>{/* Fail closed if temporary metadata is unavailable. */})};refresh();window.addEventListener('local-mcp:temporary-changed',refresh);return()=>{active=false;window.removeEventListener('local-mcp:temporary-changed',refresh)}},[])
  return (id?:string)=>ids!==null&&(!id||!ids.has(id))
}
