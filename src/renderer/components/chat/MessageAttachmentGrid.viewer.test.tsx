// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
const preview=vi.hoisted(()=>vi.fn())
vi.mock('@/components/session-resources/FilePreview',()=>({openSessionResourcePreview:preview}))
vi.mock('@/platform',()=>({default:{isDesktopLike:false}}))
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:[]})}))
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}))
vi.mock('../InputBox/Attachments',()=>({MessageAttachment:({label,onOpen}:{label:string;onOpen?:()=>void})=><button disabled={!onOpen} onClick={onOpen}>{label}</button>}))
import {MessageAttachmentGrid} from './MessageAttachmentGrid'
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('opens the original chat resource by identity rather than the parsed text or duplicate filename',()=>{
 render(<MessageAttachmentGrid sessionId="chat-1" files={[{id:'second',name:'report.pdf',storageKey:'parsed-2',rawStorageKey:'original-2'} as any]}/>);fireEvent.click(screen.getByText('report.pdf'));expect(preview).toHaveBeenCalledWith('chat-1',{id:'attachment:second',key:'original-2'})
})
it('keeps the legacy parsed-content path when the original was never stored',()=>{
 render(<MessageAttachmentGrid sessionId="chat-1" files={[{id:'old',name:'legacy.pdf',storageKey:'parsed'} as any]}/>);expect(screen.getByText('legacy.pdf').hasAttribute('disabled')).toBe(true);expect(preview).not.toHaveBeenCalled()
})
