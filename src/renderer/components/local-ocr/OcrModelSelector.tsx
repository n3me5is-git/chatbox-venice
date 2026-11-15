import {Button,Stack,Text} from '@mantine/core'
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
export function OcrModelSelector({value,onSelect,showAuto=false}:{value?:{provider:string;model:string};onSelect:(provider:string,model:string)=>void;showAuto?:boolean}){
 useTranslation();const [opened,setOpened]=useState(false),[paddleOpened,setPaddleOpened]=useState(false),local=value?.provider===LOCAL_OCR_PROVIDER,paddle=value?.provider===PADDLE_OCR_PROVIDER,localSelection=isLocalOcrProvider(value?.provider)
 return <Stack gap="xs"><ModelSelectorV2 withinPortal={false} showAuto={showAuto} selectedProviderId={localSelection?undefined:value?.provider} selectedModelId={localSelection?undefined:value?.model} modelFilter={model=>model.capabilities?.includes('vision')===true} onSelect={onSelect}><Button variant="default" fullWidth style={{height:'auto',minHeight:36,whiteSpace:'normal',overflowWrap:'anywhere'}}>{localSelection?ft('Choose a different OCR model'):value?.model||ft('Choose an OCR model')}</Button></ModelSelectorV2>
 {localOcrDesktop()?<Button variant={local?'light':'subtle'} fullWidth onClick={()=>setOpened(true)}>{local?'MiniCPM-OCR '+(localOcrVariant(value!.model)||'').toUpperCase()+' · '+ft('On this computer'):ft('Set up local MiniCPM OCR')}</Button>:local&&<Text size="xs" c="orange">{ft('Local MiniCPM OCR is available on desktop only')}</Text>}
 {paddleOcrAvailable()&&<Button variant={paddle?'light':'subtle'} fullWidth onClick={()=>setPaddleOpened(true)}>{paddle?'PaddleOCR · '+ft('On this device'):ft('Set up local PaddleOCR')}</Button>}
 {opened&&<LocalOcrManager selectedModel={value?.model} onClose={()=>setOpened(false)} onUse={model=>{onSelect(LOCAL_OCR_PROVIDER,model);setOpened(false)}}/>}
 {paddleOpened&&<PaddleOcrManager onClose={()=>setPaddleOpened(false)} onUse={model=>{onSelect(PADDLE_OCR_PROVIDER,model);setPaddleOpened(false)}}/>}</Stack>
}
