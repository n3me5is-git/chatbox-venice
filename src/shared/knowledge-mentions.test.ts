import {expect,it} from 'vitest'
import {mentionLink,mentionedKnowledgeIds} from './prompt-mentions'
it('allows only bounded safe negative collection IDs from explicit structured mentions',()=>{const link=mentionLink('Project KB','chatbox:knowledge/-123');expect(mentionedKnowledgeIds(link+' '+link)).toEqual([-123]);expect(mentionedKnowledgeIds('[@x](chatbox:knowledge/1) [@x](chatbox:knowledge/-999999999999999999)')).toEqual([])})
