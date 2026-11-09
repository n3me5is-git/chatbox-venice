import { Button } from '@mantine/core'
import { useState } from 'react'
import fixture from '../../test/fixtures/venice/catalog-2026-11-08.json'
import type { MediaCatalogItem } from '../../src/shared/providers/definitions/models/venice/media'
import { AdaptiveModal } from '../../src/renderer/components/common/AdaptiveModal'
import { ImageModelSelect } from '../../src/renderer/components/ImageModelSelect'
import { VeniceStudio } from '../../src/renderer/components/venice/VeniceStudio'
import { MobileModelDrawer } from '../../src/renderer/routes/image-creator/-components/MobileDrawers'
import { videoWorkflows } from '../../src/shared/providers/definitions/models/venice/media-capabilities'
import { SidebarTools } from '../../src/renderer/components/layout/SidebarTools'
import { ModelRow } from '../../src/renderer/components/ModelSelectorV2/ModelRow'
const images = fixture.models.filter(model => ['image','inpaint'].includes(model.type)).map(model => ({ modelId: model.id, displayName: model.model_spec.name || model.id, vendorMetadata: { ...model.model_spec, veniceType: model.type } }))
const groups = [{ providerId: 'venice', label: 'Venice', models: images }]
const allGroups=[...groups,...['OpenAI','OpenAI Sub Unofficial','Custom image provider'].map((label,index)=>({providerId:'fixture-'+index,label,isCustom:true,models:Array.from({length:85},(_,n)=>({modelId:'provider-'+index+'-image-'+n,displayName:label+' image '+n}))}))]
const videos = fixture.models.filter(model => model.type === 'video') as MediaCatalogItem[]
const service = {
  list: async () => [], subscribe: () => () => {}, cachedCatalog: async () => videos, catalog: async () => videos,
  start: async () => { throw Error('No generation is authorized by this UI test') }, isActive: () => false,
}
export function ModelPickerReviewSimulation() {
  const [imagesOpen, setImagesOpen] = useState(false), [studio, setStudio] = useState(false)
  const [selected, setSelected] = useState(images[0].modelId)
  const [allOpen,setAllOpen]=useState(false)
  const [toolsRevision,setToolsRevision]=useState(0)
  const pick = (provider: string, model: string) => { setSelected(model); (window as any).__longImageSelection = model;(window as any).__nativeImageSelection={provider,model} }
  ;(window as any).__pickerFixture = { imageIds: images.map(row => row.modelId), videoIds: videos.map(row => row.id),workflows:Object.fromEntries(['text','image','references','edit'].map(workflow=>[workflow,videos.filter(model=>videoWorkflows(model).includes(workflow as any)).map(model=>model.id)])) }
  return <>
    {[true,false].map(mobile=><div key={String(mobile)} data-chat-price-review data-row-kind={mobile?'mobile':'desktop'} style={{width:mobile?260:380,maxWidth:'calc(100vw - 16px)',margin:8}}><ModelRow detail={{providerId:'venice',providerName:'Venice',modelId:'text-price-review',name:'Long chat model name for pricing review · DeepSeek Private Reasoning Model With A Complete Name'}} providerModel={{modelId:'text-price-review',type:'chat',capabilities:['vision','reasoning','tool_use'],vendorMetadata:{privacy:'private',uncensored:true,pricing:{input:{usd:0.4},output:{usd:1.8}}}}} selected={false} favorited={false} mobile={mobile} onSelect={()=>{(window as any).__textModelSelected=true}} onFavorite={()=>{(window as any).__textModelFavorited=true}} onShowDetail={()=>{(window as any).__textModelDetails=true}}/></div>)}
    <div data-sidebar-tools-review style={{height:420,width:280,maxWidth:'calc(100vw - 16px)',margin:8,display:'flex',flexDirection:'column',border:'1px solid #aaa'}}>
      <SidebarTools key={toolsRevision}>{['Image creation tool','Media library tool','Collaboration tool','Agents tool','Venice Studio tool','Copilots tool'].map(label=><Button key={label} variant="subtle" mih={36}>{label}</Button>)}</SidebarTools>
      <div data-sidebar-chat-space style={{flex:1,minHeight:0,overflowY:'auto'}}>Projects and conversations</div>
    </div>
    <Button m="sm" onClick={()=>setToolsRevision(value=>value+1)}>Remount tools group</Button>
    <Button m="sm" onClick={() => setImagesOpen(true)}>Test long image model list</Button>
    <Button m="sm" onClick={() => setStudio(true)}>Test long Studio model list</Button>
    <Button m="sm" onClick={()=>setAllOpen(true)}>Test all image providers</Button>
    <ImageModelSelect modelGroups={groups} onSelect={pick}><span>Test desktop image model list</span></ImageModelSelect>
    <MobileModelDrawer open={imagesOpen} onOpenChange={setImagesOpen} modelGroups={groups} selectedModel={selected} selectedProvider="venice" onSelect={pick}/>
    <MobileModelDrawer open={allOpen} onOpenChange={setAllOpen} modelGroups={allGroups} selectedModel={selected} selectedProvider="venice" onSelect={pick}/>
    <AdaptiveModal opened={studio} onClose={() => setStudio(false)} title="Long Studio catalog regression" size="lg">
      <VeniceStudio service={service as any} initialKind="video" options={{videoEnabled:true,showOtherModels:true}}/>
      <Button onClick={() => setStudio(false)}>Close Studio model test</Button>
    </AdaptiveModal>
  </>
}
