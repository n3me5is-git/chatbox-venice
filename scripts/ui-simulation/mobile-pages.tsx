import {VeniceStudio} from '../../src/renderer/components/venice/VeniceStudio'
import mediaFixture from '../../test/fixtures/venice/catalog-2026-11-08.json'
import {auditPdf} from './pdf-fixture'
import {PdfDocumentViewer} from '../../src/renderer/components/common/PdfDocumentViewer'
import type {ProviderSettings} from '../../src/shared/types'
import {seedLibrary} from './mobile-review'
// Real production screens and theme; only data/native boundaries use disposable fixtures.
import '@mantine/core/styles.css'
import '../../src/renderer/static/globals.css'
import '../../src/renderer/static/index.css'
import {Capacitor} from '@capacitor/core'
import NiceModal from '@ebay/nice-modal-react'
import {MantineProvider,Stack} from '@mantine/core'
import CssBaseline from '@mui/material/CssBaseline'
import {createTheme,ThemeProvider} from '@mui/material/styles'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {createMemoryHistory,createRootRoute,createRoute,createRouter,Outlet,RouterProvider} from '@tanstack/react-router'
import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {createAppMantineTheme} from '../../src/renderer/theme/mantine-theme'
import {getThemeDesign} from '../../src/renderer/hooks/useAppTheme'
import {RouteComponent as SettingsRoute} from '../../src/renderer/routes/settings/route'
import {SettingsPage} from '../../src/renderer/components/settings/SettingsLayout'
import {AdaptiveModal} from '../../src/renderer/components/common/AdaptiveModal'
import {AppProviders} from '../../src/renderer/components/AppProviders'
import CollectionsPage from '../../src/renderer/components/knowledge-base/CollectionsPage'
import {KnowledgeModelDefaults} from '../../src/renderer/components/knowledge-base/KnowledgeModelDefaults'
import {CollectionIntelligence,collectionIntelligence} from '../../src/renderer/components/knowledge-base/CollectionIntelligence'
import {KnowledgeGraph} from '../../src/renderer/components/knowledge-base/KnowledgeGraph'
import {VeniceSearchSettings,VeniceImageSettings,VeniceModuleSettings} from '../../src/renderer/components/settings/provider/VeniceSettings'
import {ChatGPTSubscriptionSettings} from '../../src/renderer/components/settings/provider/ChatGPTSubscription'
import {VeniceProfileEditor} from '../../src/renderer/components/settings/provider/VeniceProfiles'
import {VeniceWebSearchSettings} from '../../src/renderer/components/settings/VeniceWebSearchSettings'
import {VeniceChatPrivacySettings} from '../../src/renderer/components/venice/VeniceChatPrivacySettings'
import {VeniceSessionApprovals} from '../../src/renderer/components/venice/VeniceSessionApprovals'
import {E2EEToolSettings} from '../../src/renderer/components/venice/E2EEToolSettings'
import {SecureReceiptSettings} from '../../src/renderer/components/venice/SecureReceiptSettings'
import {UserQuestionForm} from '../../src/renderer/components/agent/UserQuestion'
import {GenerationFailureContent} from '../../src/renderer/components/venice/GenerationFailure'
import {MultiAgentSettings} from '../../src/renderer/components/multi-agent/MultiAgentSettings'
import {AgentCallingDetails} from '../../src/renderer/components/multi-agent/AgentCallingDetails'
import {AgentTranscript} from '../../src/renderer/components/multi-agent/AgentTranscript'
import {LibrarySettings} from '../../src/renderer/components/security/LibrarySettings'
import {ArchiveStorage} from '../../src/renderer/components/settings/ArchiveStorage'
import {CollaborationContent} from '../../src/renderer/components/collaboration/CollaborationPanel'
import {DirectTransferContent} from '../../src/renderer/components/collaboration/DirectTransfer'
import {LocalMCPSettings} from '../../src/renderer/components/session-resources/LocalMCPSettings'
import {ApplicationMCPSettings} from '../../src/renderer/components/session-resources/ApplicationMCPSettings'
import {ChatKnowledgeReview} from '../../src/renderer/components/knowledge-base/ChatKnowledgeReview'
import {knowledgeSimulationStore} from './knowledge-collections'
import {SecuritySimulation} from './security'
import platform from './platform'
import i18n from '../../src/renderer/i18n'
import {forkT as ft} from '../../src/renderer/i18n/fork'
import {settingsStore} from '../../src/renderer/stores/settingsStore'
import {RagSettingsSchema} from '../../src/shared/session-rag'

const params=new URLSearchParams(location.search),screen=params.get('screen')||'knowledge-base',language=params.get('lang')||'it-IT',dark=params.get('theme')!=='light'
platform.type=screen.startsWith('mcp-')?'desktop':'mobile'
Object.defineProperty(Capacitor,'getPlatform',{configurable:true,value:()=> 'android'})
;(window as any).electronAPI={invoke:async(channel:string,action:string)=>channel==='local-mcp:control'?(action==='list'?[]:{running:false}):null}
Object.assign(document.documentElement.dataset,{theme:dark?'dark':'light'})
document.documentElement.classList.toggle('dark',dark)
document.documentElement.style.fontSize=params.get('large')==='1'?'20px':'16px'
document.documentElement.style.backgroundColor='var(--chatbox-background-primary)'
const provider:ProviderSettings={models:[{modelId:'fixture-private',nickname:'Private research model with a long descriptive name',type:'chat',capabilities:['vision','reasoning'],vendorMetadata:{privacy:'private',uncensored:true}},{modelId:'fixture-embedding',nickname:'Private embeddings',type:'embedding'}],apiKey:''}
settingsStore.setState({language:language as any,providers:{...settingsStore.getState().providers,venice:provider}})
const archivePort={engine:{state:async()=>({root:'internal'}),ready:async()=>{}},disk:{status:async()=>({available:true,name:'Internal'}),pick:async()=>null},subscribe:()=>()=>{},migrate:async()=>{}} as any
const noop=()=>{}
const studioService={list:async()=>[],subscribe:()=>()=>{},cachedCatalog:async()=>mediaFixture.models,catalog:async()=>mediaFixture.models,isActive:()=>false,quote:async()=>({quote:0.01}),start:async()=>{throw Error('Generation is disabled in screen audit')}} as any
function ControlledScreen(){
 const [value,setValue]=useState<any>({}),[intel,setIntel]=useState(()=>collectionIntelligence({})),[privacy,setPrivacy]=useState<any>(),[enabled,setEnabled]=useState(true)
 if(screen.startsWith('studio-'))return <VeniceStudio service={studioService} options={{audioEnabled:true,videoEnabled:true,musicEnabled:true}} initialKind={screen.slice(7) as any}/>
 switch(screen){
 case 'knowledge-base':return <CollectionsPage service={knowledgeSimulationStore}/>
 case 'pdf-viewer':return <PdfDocumentViewer url={URL.createObjectURL(new Blob([Uint8Array.from(auditPdf()).buffer],{type:'application/pdf'}))} name="Enterprise report.pdf"/>
 case 'knowledge-models':return <KnowledgeModelDefaults/>
 case 'knowledge-intelligence':return <CollectionIntelligence value={intel} onChange={setIntel}/>
 case 'knowledge-graph':return <KnowledgeGraph store={knowledgeSimulationStore} id={Number(params.get('collection'))}/>
 case 'knowledge-review':return <ChatKnowledgeReview value={value} onChange={setValue}/>
 case 'venice-search':return <VeniceSearchSettings/>
 case 'venice-image-settings':return <VeniceImageSettings model={{modelId:'test-image',vendorMetadata:{supportsNegativePrompt:true}}}/>
 case 'venice-modules':return <VeniceModuleSettings/>
 case 'venice-profile':return <VeniceProfileEditor options={{}} value={value} onChange={setValue} allowPreset/>
 case 'subscription':return <ChatGPTSubscriptionSettings/>
 case 'web-search':return <VeniceWebSearchSettings value={settingsStore.getState().extension.webSearch} onChange={next=>settingsStore.setState(state=>({extension:{...state.extension,webSearch:next}}))}/>
 case 'chat-privacy':return <VeniceChatPrivacySettings provider={{textPrivacy:'e2ee'}} value={privacy} model={{modelId:'fixture-e2ee',vendorMetadata:{privacy:'private',supportsE2EE:true}}} onChange={setPrivacy}/>
 case 'e2ee-tools':return <E2EEToolSettings enabled={enabled} mode={value.mode||'encrypted-text'} onChange={(next,mode)=>{setEnabled(next);setValue({mode})}}/>
 case 'receipts':return <SecureReceiptSettings enabled={enabled} onChange={setEnabled}/>
 case 'approvals':return <VeniceSessionApprovals sessionId="screen-audit"/>
 case 'questions':return <UserQuestionForm input={{questions:[{question:'Which documents should the worker process?',options:['The current project documents','Only the selected documents','Choose a different source'],multiple:true},{question:'Additional instructions for the agent?'}]}} onSubmit={next=>{(window as any).__submitted=next}} onCancel={noop}/>
 case 'generation-failure':return <GenerationFailureContent failure={{id:'audit',kind:'Image',model:'Private image model',error:'HTTP 400: The selected aspect ratio is not supported by this model.'}} onRetry={noop} onSkip={noop}/>
 case 'multi-agent-settings':return <MultiAgentSettings value={value} onChange={setValue}/>
 case 'agent-calling-details':return <AgentCallingDetails value={{description:'Research financial documents without identifying individuals.',...value}} onChange={next=>setValue({...value,...next})}/>
 case 'agent-transcript':return <AgentTranscript sessionId="screen-audit" messages={[{id:'audit-msg',role:'assistant',contentParts:[{type:'reasoning',text:'I will inspect the sources before preparing the report.'},{type:'text',text:'## Research result\n\nThe worker completed its task and saved the report.'}]} as any]}/>
 case 'security':return <SecuritySimulation/>
 case 'library-settings':return <LibrarySettings/>
 case 'archive-storage':return <ArchiveStorage runtime={archivePort}/>
 case 'collaboration':return <CollaborationContent/>
 case 'transfer':return <DirectTransferContent/>
 case 'mcp-session':return <LocalMCPSettings sessionId="screen-audit" invoke={async()=>({running:false})}/>
 case 'mcp-application':return <ApplicationMCPSettings/>
 default:throw Error('Unregistered screen '+screen)
 }
}
const modalScreens=new Set(['questions','generation-failure','collaboration','transfer','agent-transcript','mcp-session','mcp-application'])
function Content(){return screen==='knowledge-base'?<ControlledScreen/>:modalScreens.has(screen)?<AdaptiveModal opened onClose={noop} title={ft(screen==='collaboration'?'Collaborative chats':screen==='transfer'?'Transfer chat':screen==='questions'?'Agent question':screen==='generation-failure'?'Generation failed':screen==='agent-transcript'?'Agent conversation':'MCP server')}><div className="feature-panel"><ControlledScreen/></div></AdaptiveModal>:<SettingsPage title={screen} titleOnTouch><div className="feature-panel"><Stack><ControlledScreen/></Stack></div></SettingsPage>}
const root=createRootRoute({component:Outlet}),settings=createRoute({getParentRoute:()=>root,path:'/settings',component:SettingsRoute}),page=createRoute({getParentRoute:()=>settings,path:screen,component:Content})
const router=createRouter({routeTree:root.addChildren([settings.addChildren([page])]),history:createMemoryHistory({initialEntries:['/settings/'+screen]})})
await seedLibrary()
await i18n.changeLanguage(language)
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}})
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><MantineProvider theme={createAppMantineTheme()} forceColorScheme={dark?'dark':'light'}><AppProviders><ThemeProvider theme={createTheme(getThemeDesign(dark?'dark':'light',language as any))}><CssBaseline/><NiceModal.Provider><RouterProvider router={router}/></NiceModal.Provider></ThemeProvider></AppProviders></MantineProvider></QueryClientProvider>)
;(window as any).__screenAuditReady=screen
;(window as any).__screenAuditSeed=async()=>{const id=await knowledgeSimulationStore.create('Enterprise project manuals',RagSettingsSchema.parse({provider:'venice',model:'fixture-private-embedding',enabled:true}));await knowledgeSimulationStore.add(id,new File([Uint8Array.from(auditPdf()).buffer],'enterprise-report.pdf',{type:'application/pdf'}));knowledgeSimulationStore.vault.keys.refresh();return id}
