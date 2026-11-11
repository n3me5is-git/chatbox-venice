import type { ReactNode } from 'react'
import { Alert, Button, Group, Stack, Switch, Text } from '@mantine/core'
import type { ImageModelOption } from '@/packages/image-model-catalog'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { VeniceModelBadges } from './VeniceModelBadges'
import { VeniceModelCost } from './VeniceModelCost'
import { ImageCapabilityBadges } from './ImageCapabilityBadges'

export function ReferenceModelControl({model,count,automatic,onAutomaticChange,compatible,privacyChange=false,onChoose,children,editing=false}:{model?:ImageModelOption;count:number;automatic?:boolean;onAutomaticChange?:(value:boolean)=>void;compatible:boolean;privacyChange?:boolean;onChoose?:()=>void;children?:ReactNode;editing?:boolean}) {
  useTranslation()
  if(!count)return null
  return <Stack gap={6} p="sm" style={{border:'1px solid var(--mantine-color-default-border)',borderRadius:8}} data-reference-model-control>
    <Group justify="space-between" align="start" wrap="wrap"><Stack gap={2} style={{minWidth:0,flex:1}}>
      <Text size="xs" c="dimmed">{ft('Model for attached images')}</Text>
      <Text size="sm" fw={600} style={{overflowWrap:'anywhere'}}>{model?.displayName||ft('Choose a model')}</Text>
      {model&&<Text size="xs" c="dimmed" style={{overflowWrap:'anywhere'}}>{model.modelId}</Text>}
    </Stack>{onChoose&&<Button size="xs" variant="light" onClick={onChoose}>{ft('Choose reference model')}</Button>}</Group>
    {model&&<><VeniceModelBadges metadata={model.vendorMetadata}/>{!model.vendorMetadata?.veniceType&&<ImageCapabilityBadges capabilities={model.capabilities} editing={editing}/>}{model.vendorMetadata?.veniceType&&<VeniceModelCost metadata={model.vendorMetadata} showLabel/>}</>}
    {model?.vendorMetadata?.veniceType==='image'&&model.capabilities?.inputReferences&&<Text size="xs" c="dimmed">{ft('References guide the generated image. Choose an editing model to modify a source image.')}</Text>}
    {onAutomaticChange&&<Switch size="sm" aria-label={ft('Automatically select a compatible variant')} label={ft('Automatically select a compatible variant')} description={ft('Automatic selection requires the same declared privacy, protection and filtering. Manual choices are kept.')} checked={automatic===true} onChange={event=>onAutomaticChange(event.currentTarget.checked)}/>}
    {!compatible&&<Alert color="yellow" p="xs">{ft(privacyChange?'The compatible variant has different or undeclared privacy, protections or filtering. Choose its model explicitly before generating.':'Choose a model that accepts all attached images before generating.')}</Alert>}
    {children}
  </Stack>
}
