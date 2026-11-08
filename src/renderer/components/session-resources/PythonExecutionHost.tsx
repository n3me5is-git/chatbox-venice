import { useEffect,useMemo,useRef,useSyncExternalStore } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { PYTHON_MESSAGE_CHANNEL,buildPythonExecutionHtml } from '@shared/python-execution-html'
import { loadPythonAssets,sessionPythonExecution } from '@/packages/session-resources/python-execution'
export default function PythonExecutionHost(){
  const job=useSyncExternalStore(sessionPythonExecution.subscribe,sessionPythonExecution.getSnapshot,sessionPythonExecution.getSnapshot)
  const frame=useRef<HTMLIFrameElement>(null)
  const page=useMemo(()=>job?{token:crypto.randomUUID(),id:job.id}:null,[job])
  const html=useMemo(()=>page?buildPythonExecutionHtml(page.id,page.token):'',[page])
  useEffect(()=>{
    if(!Capacitor.isNativePlatform())return
    const subscription=App.addListener('appStateChange',({isActive})=>sessionPythonExecution.setForeground(isActive))
    return()=>{void subscription.then(listener=>listener.remove());sessionPythonExecution.setForeground(false)}
  },[])
  useEffect(()=>{
    if(!job||!page)return
    let active=true,sent=false
    const receive=(event:MessageEvent)=>{
      if(event.source!==frame.current?.contentWindow||event.origin!=='null')return
      if(typeof event.data==='object'){
        if(!event.data?.ready||event.data.channel!==PYTHON_MESSAGE_CHANNEL||event.data.token!==page.token||event.data.id!==job.id||sent)return
        sent=true
        void loadPythonAssets().then(runtime=>{if(active)frame.current?.contentWindow?.postMessage({id:job.id,token:page.token,request:{...job,...runtime}},'*')}).catch(error=>sessionPythonExecution.fail(job.id,error))
        return
      }
      if(typeof event.data!=='string'||event.data.length>32*1024*1024)return
      try{const value=JSON.parse(event.data);if(value.channel!==PYTHON_MESSAGE_CHANNEL||value.token!==page.token||value.id!==job.id)return;sessionPythonExecution.receive(job.id,value.result)}catch{sessionPythonExecution.fail(job.id,new Error('Invalid Python execution response'))}
    }
    window.addEventListener('message',receive);return()=>{active=false;window.removeEventListener('message',receive)}
  },[job,page])
  if(!job||!page)return null
  return <iframe ref={frame} key={job.id} title="Local Python execution" aria-hidden tabIndex={-1} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={html} onError={()=>sessionPythonExecution.fail(job.id,new Error('Python worker failed'))} style={{position:'fixed',width:1,height:1,opacity:0,pointerEvents:'none',border:0}}/>
}
