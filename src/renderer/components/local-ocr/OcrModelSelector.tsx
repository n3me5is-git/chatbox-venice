import {Button,Stack,Text} from '@mantine/core'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {LOCAL_OCR_PROVIDER,localOcrVariant} from '@shared/local-ocr'
import {localOcrDesktop} from '@/packages/local-ocr/client'
import ModelSelectorV2 from '@/components/ModelSelectorV2'
import {forkT as ft} from '@/i18n/fork'
import {LocalOcrManager} from './LocalOcrManager'
export function OcrModelSelector({value,onSelect,showAuto=false}:{value?:{provider:string;model:string};onSelect:(provider:string,model:string)=>void;showAuto?:boolean}){
 useTranslation();const [opened,setOpened]=useState(false),local=value?.provider===LOCAL_OCR_PROVIDER
 return <Stack gap="xs"><ModelSelectorV2 withinPortal={false} showAuto={showAuto} selectedProviderId={local?undefined:value?.provider} selectedModelId={local?undefined:value?.model} modelFilter={model=>model.capabilities?.includes('vision')===true} onSelect={onSelect}><Button variant="default" fullWidth style={{height:'auto',minHeight:36,whiteSpace:'normal',overflowWrap:'anywhere'}}>{local?ft('Choose a different OCR model'):value?.model||ft('Choose an OCR model')}</Button></ModelSelectorV2>
 {localOcrDesktop()?<Button variant={local?'light':'subtle'} fullWidth onClick={()=>setOpened(true)}>{local?'MiniCPM-OCR '+(localOcrVariant(value!.model)||'').toUpperCase()+' · '+ft('On this computer'):ft('Set up local MiniCPM OCR')}</Button>:local&&<Text size="xs" c="orange">{ft('Local MiniCPM OCR is available on desktop only')}</Text>}
 {opened&&<LocalOcrManager selectedModel={value?.model} onClose={()=>setOpened(false)} onUse={model=>{onSelect(LOCAL_OCR_PROVIDER,model);setOpened(false)}}/>}</Stack>
}
