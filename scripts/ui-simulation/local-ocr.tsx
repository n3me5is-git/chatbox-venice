import {Button} from '@mantine/core'
import {useState} from 'react'
import {LocalOcrManager} from '../../src/renderer/components/local-ocr/LocalOcrManager'
import type {LocalOcrStatus} from '../../src/shared/local-ocr'
export function LocalOcrSimulation(){
 const [opened,setOpened]=useState(false),[previous,setPrevious]=useState<any>()
 const close=()=>{(window as any).electronAPI=previous;setOpened(false)}
 const show=()=>{setPrevious(()=>window.electronAPI);let status:LocalOcrStatus={config:{backend:'cpu',threads:4,idleSeconds:120},ready:['q4','q8'],projector:true,runtime:true,loaded:false,pending:0,busy:false,root:'AppData/Chatbox/local-ocr',platformSupported:true};(window as any).__localOcrCalls=[];(window as any).electronAPI={invoke:async(_channel:string,command:string,value:any)=>{(window as any).__localOcrCalls.push({command,value});if(command==='configure')status={...status,config:value};if(command==='ocr')return 'Synthetic recognized text';return structuredClone(status)}};setOpened(true)}
 return <><Button m="sm" onClick={show}>Test local OCR setup</Button>{opened&&<LocalOcrManager onClose={close} onUse={model=>{(window as any).__localOcrSelected=model;close()}}/>}</>
}
