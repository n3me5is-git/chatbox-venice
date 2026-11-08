import { Button,Stack,Switch } from '@mantine/core'
import { useState } from 'react'
import type { VeniceOptions } from '../../src/shared/providers/definitions/models/venice/options'
import { AdaptiveModal } from '../../src/renderer/components/common/AdaptiveModal'
import { VeniceSearchControl } from '../../src/renderer/components/venice/VeniceSearchControl'
import { E2EEToolSettings } from '../../src/renderer/components/venice/E2EEToolSettings'
import { VeniceProfileEditor } from '../../src/renderer/components/settings/provider/VeniceProfiles'
import { VeniceWebSearchSettings } from '../../src/renderer/components/settings/VeniceWebSearchSettings'
import { settingsStore,useSettingsStore } from '../../src/renderer/stores/settingsStore'
import { createConfiguredWebSearchTools } from '../../src/shared/web-search-tool'
export function SearchReviewSimulation(){
 const [opened,setOpened]=useState(false),[details,setDetails]=useState(false),[global,setGlobal]=useState(true),[globalDetails,setGlobalDetails]=useState(false)
 const extension=useSettingsStore(state=>state.extension)
 const [settings,setSettings]=useState<VeniceOptions>({webSearch:'auto',searchProvider:'brave',webSearchEnabled:true})
 Object.assign(window,{__simulationSearchSettings:settings,__simulationGlobalSearch:global})
 Object.assign(window,{__simulationGlobalSearchConfig:()=>settingsStore.getState().extension.webSearch,__simulationGlobalToolNames:()=>Object.keys(createConfiguredWebSearchTools(settingsStore.getState().extension.webSearch,async()=>({searchResults:[]})))})
 return <><Button m="sm" onClick={()=>setOpened(true)}>Test independent search controls</Button>
 <Button m="sm" onClick={()=>{const state=settingsStore.getState();state.setSettings({extension:{...state.extension,webSearch:{...state.extension.webSearch,provider:'venice'}}});setGlobalDetails(true)}}>Test global search settings</Button>
 <AdaptiveModal opened={globalDetails} onClose={()=>setGlobalDetails(false)} title="Global Chatbox web search"><VeniceWebSearchSettings value={extension.webSearch} onChange={patch=>{const state=settingsStore.getState();state.setSettings({extension:{...state.extension,webSearch:{...state.extension.webSearch,...patch}}})}}/><Button mt="md" onClick={()=>setGlobalDetails(false)}>Close global search settings</Button></AdaptiveModal>
 <AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title="Search and encrypted tool review"><Stack>
   <Switch label="Global search toggle (simulation)" checked={global} onChange={event=>setGlobal(event.currentTarget.checked)}/>
   <VeniceSearchControl settings={settings} onOpen={()=>setDetails(true)} onEnabledChange={enabled=>setSettings(current=>({...current,webSearchEnabled:enabled}))}/>
   <E2EEToolSettings enabled={settings.e2eeToolsEnabled===true} mode={settings.e2eeToolMode||'encrypted-text'} onChange={(e2eeToolsEnabled,e2eeToolMode)=>setSettings(current=>({...current,e2eeToolsEnabled,e2eeToolMode}))}/>
   <Button onClick={()=>setOpened(false)}>Close search review</Button>
 </Stack></AdaptiveModal>
 <AdaptiveModal opened={details} onClose={()=>setDetails(false)} title="Venice search settings"><VeniceProfileEditor options={{}} value={settings} onChange={value=>setSettings(current=>({...current,...value}))} allowPreset={false}/><Button mt="md" onClick={()=>setDetails(false)}>Close search settings</Button></AdaptiveModal>
 </>
}
