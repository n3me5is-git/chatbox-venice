import {expect,it} from 'vitest'
import {knowledgeEvidenceId,knowledgeEvidenceUrl,parseKnowledgeEvidenceUrl} from './knowledge-evidence'
it('accepts only canonical opaque local source links, with no external credentials or embedded document content',async()=>{
 const value={collectionId:-42,fileId:91,sourceHash:'a'.repeat(64),quote:'Private source',line:3},id=await knowledgeEvidenceId(value),url=knowledgeEvidenceUrl(-42,91,id)
 expect(parseKnowledgeEvidenceUrl(url)).toEqual({collectionId:-42,fileId:91,id});expect(url).not.toContain('Private')
 for(const bad of [url+'?x=1',url+'#page',url.replace('https:','http:'),url.replace('chatbox.invalid','chatbox.invalid.evil'),url.replace('https://','https://user@'),url.replace('/91/','/0/'),url.replace('/-42/','/42/'),url.replace('/-42/','/-042/'),url.replace('/91/','/9007199254740993/'),'javascript:alert(1)'])expect(parseKnowledgeEvidenceUrl(bad)).toBeNull()
 expect(await knowledgeEvidenceId({...value,quote:'Other'})).not.toBe(id);expect(await knowledgeEvidenceId({...value,sourceHash:'b'.repeat(64)})).not.toBe(id)
})
