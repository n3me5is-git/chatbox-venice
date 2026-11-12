import {beforeEach,expect,it,vi} from 'vitest'
import {sha256} from '@noble/hashes/sha256'
import {defaultLocalMCPPermissions,LocalMCPApplicationSchema,type LocalMCPGrant} from '@shared/local-mcp'
import {EncryptedChunkStore,type AssetHeader} from '@/packages/vault/chunk-store'
import {aesKey} from '@/packages/vault/crypto'
const state=vi.hoisted(()=>({vault:{} as any,settings:new Map<string,any>(),files:[] as any[],enabled:true,locked:false}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>state.vault}))
vi.mock('@/packages/session-resources/files',()=>({sessionFiles:{index:async()=>({toolsEnabled:state.enabled}),list:async()=>state.files,adopt:async(_id:string,files:any[])=>{if(files.some(file=>state.files.some(old=>old.path===file.path)))throw Error('A file already exists');state.files.push(...files)}}}))
vi.mock('@/packages/session-resources/service',()=>({listSessionResources:async()=>({items:state.files,truncated:false}),readSessionResource:vi.fn()}))
import {uploadMCPFile,mcpUploadSchema,cleanupMCPUploads} from './uploads'
import {transferMCPResource} from './resource-transfer'
import {localMCPOwner} from './temporary'
const hex=(bytes:Uint8Array)=>Array.from(sha256(bytes),n=>n.toString(16).padStart(2,'0')).join('')
const base64=(bytes:Uint8Array)=>Buffer.from(bytes).toString('base64')
const grant=(token='first'):LocalMCPGrant=>({running:true,sessionId:'application',endpointId:crypto.randomUUID(),application:LocalMCPApplicationSchema.parse({mode:'router',name:'Files'}),url:'http://127.0.0.1:3000/mcp',token,startedAt:1,permissions:{...defaultLocalMCPPermissions,writeFiles:true}})
let values:Map<string,string>,headers:Map<string,AssetHeader>
beforeEach(async()=>{
 state.settings.clear();state.files=[];state.enabled=true;state.locked=false;values=new Map();headers=new Map()
 const key=await aesKey(crypto.getRandomValues(new Uint8Array(32)))
 const assets=new EncryptedChunkStore({get:async id=>values.get(id)||null,set:async(id,value)=>{values.set(id,value)},remove:async id=>{values.delete(id)},keys:async()=>[...values.keys()]},{get:async id=>structuredClone(headers.get(id)||null),byAlias:async alias=>structuredClone([...headers.values()].find(row=>row.alias===alias&&row.status==='ready')||null),put:async row=>{headers.set(row.id,structuredClone(row))},remove:async id=>{headers.delete(id)},page:async()=>({items:[...headers.values()],next:null}),all:async function*(){yield* [...headers.values()]}},async()=>{if(state.locked)throw Error('Locked');return key})
 state.vault={assets,projects:{assertSession:async()=>{if(state.locked)throw Error('Locked')},assertLibraryKey:async()=>{if(state.locked)throw Error('Locked')},sessionScope:async()=>null},db:{getSetting:async(id:string)=>structuredClone(state.settings.get(id)),setSettingIfUnchanged:async(id:string,old:any,next:any)=>{if(JSON.stringify(state.settings.get(id))!==JSON.stringify(old))return false;state.settings.set(id,structuredClone(next));return true}}}
})
it('round-trips encrypted binary chunks, verifies SHA-256 and keeps retrying an input from duplicating its file',async()=>{
 const g=grant(),content=new Uint8Array(256*1024+200).fill(73),id=crypto.randomUUID(),signal=new AbortController().signal
 const common={uploadId:id,path:'inputs/reference.png',mime:'image/png',totalBytes:content.length,sha256:hex(content)}
 const first=mcpUploadSchema.parse({...common,index:0,base64:base64(content.subarray(0,256*1024))})
 expect(await uploadMCPFile(g,'workspace',first,signal)).toMatchObject({nextIndex:1});await uploadMCPFile(g,'workspace',first,signal)
 const last=mcpUploadSchema.parse({...common,index:1,base64:base64(content.subarray(256*1024)),final:true})
 expect(await uploadMCPFile(g,'workspace',last,signal)).toMatchObject({complete:true,sha256:hex(content)});await uploadMCPFile(g,'workspace',last,signal)
 expect(state.files).toHaveLength(1);expect(headers.size).toBe(1)
 expect(JSON.stringify([...values.values()])).not.toContain('IIIIIIIIIIIIIIIIIIII')
 const file=state.files[0],a=await transferMCPResource('workspace',{action:'read',resourceId:file.id,offset:0,length:256*1024},signal) as any
 const b=await transferMCPResource('workspace',{action:'read',resourceId:file.id,offset:a.nextOffset,length:256*1024,version:a.version},signal) as any
 const joined=new Uint8Array(a.bytes+b.bytes);joined.set(Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0)));joined.set(Uint8Array.from(atob(b.base64),c=>c.charCodeAt(0)),a.bytes);expect(joined).toEqual(content);expect(a.sha256).toBe(hex(content));expect(b.nextOffset).toBeNull()
 await expect(transferMCPResource('workspace',{action:'read',resourceId:file.id,offset:1,length:2,version:'changed'},signal)).rejects.toThrow('changed')
 await cleanupMCPUploads(await localMCPOwner(g));expect(headers.size).toBe(1) // committed user file survives upload staging cleanup
})
it('blocks cross-endpoint uploads, detects modified chunks and never publishes a full-file hash mismatch',async()=>{
 const g=grant(),signal=new AbortController().signal,common={uploadId:crypto.randomUUID(),path:'sample.bin',mime:'application/octet-stream',totalBytes:3,sha256:'0'.repeat(64)}
 const input=mcpUploadSchema.parse({...common,index:0,base64:base64(new Uint8Array([1,2,3]))})
 await uploadMCPFile(g,'workspace',input,signal)
 await expect(uploadMCPFile(grant('other'),'workspace',input,signal)).rejects.toThrow('different request')
 await expect(uploadMCPFile(g,'workspace',{...input,base64:base64(new Uint8Array([3,2,1]))},signal)).rejects.toThrow('differs')
 await expect(uploadMCPFile(g,'workspace',{...input,final:true},signal)).rejects.toThrow('SHA-256');expect(state.files).toHaveLength(0)
 await cleanupMCPUploads(await localMCPOwner(g));expect(headers.size).toBe(0);expect(values.size).toBe(0)
})
it('honors a locked scope and the workspace switch before reading or uploading bytes',async()=>{
 const g=grant(),signal=new AbortController().signal,input=mcpUploadSchema.parse({uploadId:crypto.randomUUID(),path:'a.txt',mime:'text/plain',totalBytes:1,sha256:hex(new Uint8Array([1])),index:0,base64:'AQ==',final:true})
 state.enabled=false;await expect(uploadMCPFile(g,'workspace',input,signal)).rejects.toThrow('disabled');await expect(transferMCPResource('workspace',{action:'list',offset:0,length:10},signal)).rejects.toThrow('disabled')
 state.enabled=true;state.locked=true;await expect(uploadMCPFile(g,'workspace',input,signal)).rejects.toThrow('Locked');expect(headers.size).toBe(0)
})
