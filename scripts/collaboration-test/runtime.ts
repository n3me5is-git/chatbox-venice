import {CollaborationHub} from '../../src/renderer/packages/collaboration/hub'
import {createMessage} from '@shared/types'
import type {SharedSnapshot,HitlAnswer,HitlInput} from '@shared/collaboration'
import {qrSvg,scanQR} from '../../src/renderer/packages/collaboration/transport'
const picture=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/T9sAAAAASUVORK5CYII='),value=>value.charCodeAt(0))
const snapshot:SharedSnapshot={title:'Collaborative test',messages:[{id:'welcome',role:'assistant',text:'Shared **Markdown** with $a^2+b^2=c^2$.'}],files:[{id:'picture',path:'images/pixel.png',name:'pixel.png',mime:'image/png',bytes:picture.length,deliverable:true},{id:'large',path:'work/intermediate.js',name:'intermediate.js',mime:'text/javascript',bytes:3*1024*1024,deliverable:false}],truncated:false,revision:1}
let cloneBytes=0,submissions=0
export const collaboration=new CollaborationHub({
 snapshot:async()=>structuredClone(snapshot),
 submit:async(_id,text,interact,author,authorization)=>{authorization.assert();authorization.signal.throwIfAborted();submissions++;snapshot.messages.push({id:createMessage().id,role:'user',text,author});if(interact)snapshot.messages.push({id:createMessage().id,role:'assistant',text:'Simulated AI response.'});snapshot.revision++},
 async *file(_id,id){if(id==='picture'){yield picture.slice();return}for(let index=0;index<96;index++)yield new Uint8Array(32768).fill(97)},
 clone:async(copy,read,signal)=>{cloneBytes=0;for(const file of copy.files)for await(const bytes of read(file.id)){signal.throwIfAborted();cloneBytes+=bytes.length}return 'imported-chat'},
})
export function initializeCollaboration(){window.addEventListener('chatbox:privacy-lock',()=>collaboration.stopAll(),{once:true})}
export function switchCurrentSession(id:string){(window as any).__clonedSession=id}
const state=()=>({hosts:[...collaboration.hosts.values()].map(room=>({id:room.id,code:room.code,policy:room.policy,peers:[...room.peers.values()].map(peer=>({id:peer.author.id,name:peer.author.name,approved:peer.approved,permissions:peer.permissions})),hitls:room.hitl.requests('owner'),error:room.error})),guests:[...collaboration.guests.values()].map(room=>({id:room.id,status:room.status,permissions:room.permissions,hitls:room.hitls,snapshot:room.snapshot,error:room.error})),cloneBytes,submissions})
;(window as any).collabTest={state,hub:collaboration,
 ask:(kind:HitlInput['kind']='questions')=>{const room=[...collaboration.hosts.values()][0],requester=[...room.peers.keys()][0],input:HitlInput=kind==='questions'?{kind:'questions',input:{questions:[{question:'Which deliverables?',options:['Image','Video'],multiple:true}]}}:kind==='image'?{kind:'image',prompt:'A blue mountain',count:1,modelId:'test',models:[{id:'test',name:'Test image model'},{id:'other',name:'Other image model'}]}:{kind:'confirm',title:'Retry paid generation?',detail:'The last attempt failed. Approve a new paid request or reject to skip.'};(window as any).__decision=undefined;void collaboration.decision<HitlAnswer>('demo',requester,input,()=>new Promise(()=>{}),value=>value,value=>value).then(value=>(window as any).__decision=value);return true},
 async qr(){const code=[...collaboration.hosts.values()][0].code,image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qrSvg(code));await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1000;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,1000,1000);return scanQR(ctx.getImageData(0,0,1000,1000).data,1000,1000)?.data===code},
}
