import { expect,it } from 'vitest'
import { filterPromptMentions,insertPromptMention,mentionLink,mentionedChatIds,promptMentionQuery } from './prompt-mentions'
it('finds inline @ at the caret without treating email addresses as mentions',()=>{
  expect(promptMentionQuery('Review @analyst then continue',15)).toEqual({start:7,end:15,query:'analyst'})
  expect(promptMentionQuery('a@example.com',13)).toBeNull();expect(promptMentionQuery('Use @',5)?.query).toBe('')
  expect(insertPromptMention('Use @an and continue',{start:4,end:7},'@analyst')).toEqual({value:'Use @analyst  and continue',cursor:13})
})
it('makes exact conversation references and rejects plain guessed IDs or URLs',()=>{
  const tag=mentionLink('Report [review]','chatbox:chat/session_1')
  expect(mentionedChatIds(tag+' '+tag)).toEqual(['session_1']);expect(mentionedChatIds('chatbox:chat/session_2 @session_2')).toEqual([])
  expect(filterPromptMentions([{id:'1',kind:'tool',name:'mcp_calendar',description:'Appointments',insert:'@tool:mcp_calendar'}],'appoint')).toHaveLength(1)
})
