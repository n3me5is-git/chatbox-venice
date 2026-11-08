import {expect,it} from 'vitest'
import type {MessageToolCallPart} from '@shared/types'
import {mediaArtifactIds,mediaArtifactResource} from './media-artifacts'
it('supports old and new transcript references, deduplicates IDs and rejects remote URLs',()=>{
 const part=(result:unknown,toolName='venice_media')=>({toolName,state:'result',result}) as MessageToolCallPart
 expect(mediaArtifactIds([part({id:'old',kind:'music'}),part({artifact:{type:'venice_media',recordId:'new'}}),part({id:'old',kind:'music'}),part({id:'https://example.com/audio.mp3',kind:'music'}),part({id:'foreign-tool',kind:'video'},'external_tool')])).toEqual(['old','new'])
})
it('never constructs a file reference from another chat or a redacted record',()=>{
 const record={id:'one',sessionId:'chat',kind:'video',model:'video',prompt:'saved',createdAt:1,status:'ready',origin:'',credentialId:'',blobKey:'local',mime:'video/mp4'} as const
 expect(()=>mediaArtifactResource(record,'other')).toThrow('this chat')
 expect(()=>mediaArtifactResource({...record,protectedRecord:true},'chat')).toThrow('this chat')
 expect(mediaArtifactResource(record,'chat')).toMatchObject({id:'media:one',path:'media/video/one.mp4',key:'local',origin:'media'})
})
