import type {LocalMCPGrant} from '@shared/local-mcp'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import platform from '@/platform'
const MANIFEST='local-mcp:temporary-contexts:v1'
export type TemporaryMCPEntry={id:string;owner:string;endpointId:string;createdAt:number;rootId?:string;voices?:string[];cleanupPending?:boolean;ownedAssets?:string[];imageIds?:string[]}
export const localMCPOwner=async(grant:LocalMCPGrant)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(grant.token))),n=>n.toString(16).padStart(2,'0')).join('')
export async function temporaryMCPEntries(){return await vaultRuntimeFor(platform).db.getSetting<TemporaryMCPEntry[]>(MANIFEST)||[]}
let known:TemporaryMCPEntry[]=[]
export async function mutateTemporaryMCPEntries(update:(items:TemporaryMCPEntry[])=>TemporaryMCPEntry[]){
  const db=vaultRuntimeFor(platform).db
  for(let i=0;i<20;i++){const old=await db.getSetting<TemporaryMCPEntry[]>(MANIFEST);const next=update(old||[]);if(await db.setSettingIfUnchanged(MANIFEST,old,next)){known=next;window.dispatchEvent(new Event('local-mcp:temporary-changed'));return}}
  throw Error('Temporary workspaces changed; try again')
}
export async function temporaryMCPSessionIds(){if(platform.type!=='desktop')return new Set<string>();return new Set((await temporaryMCPEntries()).map(item=>item.id))}
export async function registerTemporaryMCPChild(rootId:string,id:string){const parent=known.find(item=>item.id===rootId);if(parent)await mutateTemporaryMCPEntries(items=>[...items,{id,owner:parent.owner,endpointId:parent.endpointId,createdAt:Date.now(),rootId:parent.rootId||rootId}])}

/** The image service allocates a fresh encrypted key for each data URL before this callback. */
export async function registerTemporaryMCPImage(record:{id:string;referenceImages:string[];source?:{sessionId?:string}},originalReferences:string[]){
  const id=record.source?.sessionId;if(!id||!known.some(item=>item.id===id))return
  const owned=record.referenceImages.filter((key,index)=>originalReferences[index]?.startsWith('data:image/')&&!key.startsWith('data:'))
  await mutateTemporaryMCPEntries(items=>items.map(item=>item.id===id?{...item,imageIds:[...new Set([...(item.imageIds||[]),record.id])],ownedAssets:[...new Set([...(item.ownedAssets||[]),...owned])]}:item))
}
