import { Button } from '@mantine/core'
import { useState } from 'react'
import fixture from '../../test/fixtures/venice/catalog-2026-11-08.json'
import type { MediaCatalogItem } from '../../src/shared/providers/definitions/models/venice/media'
import { AdaptiveModal } from '../../src/renderer/components/common/AdaptiveModal'
import { ImageModelSelect } from '../../src/renderer/components/ImageModelSelect'
import { VeniceStudio } from '../../src/renderer/components/venice/VeniceStudio'
import { MobileModelDrawer } from '../../src/renderer/routes/image-creator/-components/MobileDrawers'
import { videoWorkflows } from '../../src/shared/providers/definitions/models/venice/media-capabilities'
const images = fixture.models.filter(model => ['image','inpaint'].includes(model.type)).map(model => ({ modelId: model.id, displayName: model.model_spec.name || model.id, vendorMetadata: { ...model.model_spec, veniceType: model.type } }))
const groups = [{ providerId: 'venice', label: 'Venice', models: images }]
const videos = fixture.models.filter(model => model.type === 'video') as MediaCatalogItem[]
const service = {
  list: async () => [], subscribe: () => () => {}, cachedCatalog: async () => videos, catalog: async () => videos,
  start: async () => { throw Error('No generation is authorized by this UI test') }, isActive: () => false,
}
export function ModelPickerReviewSimulation() {
  const [imagesOpen, setImagesOpen] = useState(false), [studio, setStudio] = useState(false)
  const [selected, setSelected] = useState(images[0].modelId)
  const pick = (_provider: string, model: string) => { setSelected(model); (window as any).__longImageSelection = model }
  ;(window as any).__pickerFixture = { imageIds: images.map(row => row.modelId), videoIds: videos.map(row => row.id),workflows:Object.fromEntries(['text','image','references','edit'].map(workflow=>[workflow,videos.filter(model=>videoWorkflows(model).includes(workflow as any)).map(model=>model.id)])) }
  return <>
    <Button m="sm" onClick={() => setImagesOpen(true)}>Test long image model list</Button>
    <Button m="sm" onClick={() => setStudio(true)}>Test long Studio model list</Button>
    <ImageModelSelect modelGroups={groups} onSelect={pick}><span>Test desktop image model list</span></ImageModelSelect>
    <MobileModelDrawer open={imagesOpen} onOpenChange={setImagesOpen} modelGroups={groups} selectedModel={selected} selectedProvider="venice" onSelect={pick}/>
    <AdaptiveModal opened={studio} onClose={() => setStudio(false)} title="Long Studio catalog regression" size="lg">
      <VeniceStudio service={service as any} initialKind="video" options={{videoEnabled:true,showOtherModels:true}}/>
      <Button onClick={() => setStudio(false)}>Close Studio model test</Button>
    </AdaptiveModal>
  </>
}
