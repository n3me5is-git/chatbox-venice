// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { SpeechError } from '@shared/speech-client'
const state=vi.hoisted(()=>({settings:{} as any,session:{} as any,check:vi.fn(),transcribe:vi.fn(),synthesize:vi.fn(),consent:vi.fn()}))
vi.mock('@/packages/speech/service',()=>({speechClient:{check:state.check,transcribe:state.transcribe,synthesize:state.synthesize}}))
vi.mock('@/stores/settingsStore',()=>({useSettingsStore:(selector:any)=>selector(state.settings)}))
vi.mock('@/stores/session/session-settings',()=>({useSessionSettings:()=>({sessionSettings:state.session})}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({keys:{subscribe:()=>()=>{}}})}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('@/components/venice/VeniceRecorder',()=>({VeniceRecorder:({onRecorded}:any)=><button onClick={()=>onRecorded(new File(['audio'],'recording.wav',{type:'audio/wav'}))}>Record test audio</button>}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:({opened,title,children}:any)=>opened?<div role="dialog" aria-label={title}>{children}</div>:null}))
vi.mock('./SpeechConsent',()=>({requestSpeechConsent:state.consent}))
vi.mock('react-i18next',()=>({useTranslation:()=>({})}))
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
import { SpeechMicrophone,SpeechReadAloud } from './SpeechControls'
beforeEach(()=>{
  vi.clearAllMocks();state.settings={providers:{venice:{venice:{textPrivacy:'standard'},models:[{modelId:'chat',vendorMetadata:{privacy:'private'}}]}},defaultASRModel:{provider:'venice',model:'asr'},defaultTTSModel:{provider:'venice',model:'tts'},speechCatalog:[{provider:'venice',model:'asr',kind:'asr',metadata:{privacy:'private'}},{provider:'venice',model:'tts',kind:'tts',metadata:{privacy:'private'}}]};state.session={provider:'venice',modelId:'chat'}
  state.check.mockResolvedValue({model:{metadata:{}}});state.transcribe.mockResolvedValue('Editable dictated text');state.synthesize.mockResolvedValue(new Blob(['audio'],{type:'audio/wav'}));state.consent.mockResolvedValue(true)
  URL.createObjectURL=vi.fn(()=> 'blob:test-speech');URL.revokeObjectURL=vi.fn();HTMLMediaElement.prototype.pause=vi.fn()
})
afterEach(cleanup)
it('puts transcription into the draft only after an explicit action',async()=>{
  const onText=vi.fn();render(<MantineProvider><SpeechMicrophone context={{sessionId:'one'}} onText={onText}/></MantineProvider>)
  fireEvent.click(screen.getByRole('button',{name:'Dictate a prompt'}));fireEvent.click(await screen.findByRole('button',{name:'Record test audio'}));expect(onText).not.toHaveBeenCalled();expect(state.transcribe).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Transcribe into draft'}));await waitFor(()=>expect(onText).toHaveBeenCalledWith('Editable dictated text'));expect(screen.queryByRole('dialog')).toBeNull()
})
it('shows the privacy block when a disabled speech control is tapped, without opening a recorder',async()=>{
  state.settings.speechCatalog=[];state.check.mockRejectedValue(new SpeechError('Speech is disabled because this chat is private and the speech model is not declared private. Choose a private speech model in Default models.'))
  render(<MantineProvider><SpeechMicrophone context={{sessionId:'one'}} onText={vi.fn()}/></MantineProvider>)
  const mic=screen.getByRole('button',{name:'Dictate a prompt'});expect(mic.getAttribute('aria-disabled')).toBe('true');fireEvent.click(mic)
  expect((await screen.findByRole('alert')).textContent).toContain('disabled');expect(screen.queryByRole('button',{name:'Record test audio'})).toBeNull();expect(state.transcribe).not.toHaveBeenCalled()
})
it('uses the per-request E2EE consent callback and cleans up playback on privacy lock',async()=>{
  state.session.veniceSecurity={textPrivacy:'e2ee'};state.synthesize.mockImplementation(async(_context:any,_text:any,_signal:any,confirm:any)=>{if(!await confirm())throw new DOMException('Cancelled','AbortError');return new Blob(['audio'],{type:'audio/wav'})})
  render(<MantineProvider><SpeechReadAloud context={{sessionId:'one'}} text={()=> '# A reply\n\nVisible text\n\n```js\nsecretCode()\n```'}/></MantineProvider>)
  fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));await waitFor(()=>expect(screen.getByLabelText('Reply audio')).toBeTruthy())
  expect(state.consent).toHaveBeenCalledTimes(1);expect(state.synthesize.mock.calls[0][1]).toContain('Visible text');expect(state.synthesize.mock.calls[0][1]).not.toContain('secretCode')
  window.dispatchEvent(new Event('chatbox:privacy-lock'));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-speech');expect(state.synthesize.mock.calls[0][2].aborted).toBe(true)
})
it('never invokes synthesis automatically on render',()=>{
  render(<MantineProvider><SpeechReadAloud context={{sessionId:'one'}} text={()=> 'Reply'}/></MantineProvider>);expect(state.synthesize).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull()
})
