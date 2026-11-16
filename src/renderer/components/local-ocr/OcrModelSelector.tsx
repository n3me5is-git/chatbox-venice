import {ocrTransportIssue} from '@shared/ocr-transport'
import {useSettingsStore} from '@/stores/settingsStore'
import {Alert,Button,Stack,Text} from '@mantine/core'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {LOCAL_OCR_PROVIDER,isLocalOcrProvider,localOcrVariant} from '@shared/local-ocr'
import {PADDLE_OCR_PROVIDER} from '@shared/paddle-ocr'
import {paddleOcrAvailable} from '@/packages/paddle-ocr/client'
import {PaddleOcrManager} from './PaddleOcrManager'
import {localOcrDesktop} from '@/packages/local-ocr/client'
import ModelSelectorV2 from '@/components/ModelSelectorV2'
import {forkT as ft} from '@/i18n/fork'
import {LocalOcrManager} from './LocalOcrManager'
export function OcrModelSelector({value,onSelect,showAuto=false,visionOnly=false}:{value?:{provider:string;model:string};onSelect:(provider:string,model:string)=>void;showAuto?:boolean;visionOnly?:boolean}){
 const providers=useSettingsStore(state=>state.providers),issue=ocrTransportIssue(value?.provider,value?.model,value?.provider?providers?.[value.provider]:undefined)
 useTranslation();const [opened,setOpened]=useState(false),[paddleOpened,setPaddleOpened]=useState(false),local=value?.provider===LOCAL_OCR_PROVIDER,paddle=value?.provider===PADDLE_OCR_PROVIDER,localSelection=isLocalOcrProvider(value?.provider)
 return <Stack gap="xs"><ModelSelectorV2 withinPortal={false} showAuto={showAuto} selectedProviderId={localSelection?undefined:value?.provider} selectedModelId={localSelection?undefined:value?.model} modelFilter={model=>model.capabilities?.includes('vision')===true} modelDisabledCheck={(model,provider)=>ocrTransportIssue(provider,model.modelId,provider?providers?.[provider]:undefined,model)} onSelect={onSelect}><Button variant="default" fullWidth style={{height:'auto',minHeight:36,whiteSpace:'normal',overflowWrap:'anywhere'}}>{localSelection?ft('Choose a different OCR model'):value?.model?value.model+' · '+value.provider:ft('Choose a vision model (virtual OCR)')}</Button></ModelSelectorV2>
 {issue&&<Alert color="yellow" role="alert">{ft(issue)}</Alert>}
 <Text size="xs" c="dimmed">{ft('Any model with Vision can transcribe images; a dedicated OCR model is not required. For custom models, enable the Vision capability in provider settings. Images are processed by the selected provider.')}</Text>
 {!visionOnly&&(localOcrDesktop()?<Button variant={local?'light':'subtle'} fullWidth onClick={()=>setOpened(true)}>{local?'MiniCPM-OCR '+(localOcrVariant(value!.model)||'').toUpperCase()+' · '+ft('On this computer'):ft('Set up local MiniCPM OCR')}</Button>:local&&<Text size="xs" c="orange">{ft('Local MiniCPM OCR is available on desktop only')}</Text>)}
 {!visionOnly&&paddleOcrAvailable()&&<Button variant={paddle?'light':'subtle'} fullWidth onClick={()=>setPaddleOpened(true)}>{paddle?'PaddleOCR · '+ft('On this device'):ft('Set up local PaddleOCR')}</Button>}
 {opened&&<LocalOcrManager selectedModel={value?.model} onClose={()=>setOpened(false)} onUse={model=>{onSelect(LOCAL_OCR_PROVIDER,model);setOpened(false)}}/>}
 {paddleOpened&&<PaddleOcrManager onClose={()=>setPaddleOpened(false)} onUse={model=>{onSelect(PADDLE_OCR_PROVIDER,model);setPaddleOpened(false)}}/>}</Stack>
}
