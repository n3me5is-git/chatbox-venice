import { useEffect, useState } from 'react'
import { forkT as ft } from '@/i18n/fork'
import { useComputedColorScheme } from '@mantine/core'

let queue:Promise<unknown>=Promise.resolve()
/** Render as an image document: no application bridge, callbacks or analytics. */
export function LocalMermaid({source}:{source:string}){
  const theme=useComputedColorScheme('light')
  const [url,setUrl]=useState(''),[error,setError]=useState(false)
  useEffect(()=>{
    let active=true,owned='';setUrl('');setError(false)
    const job=queue.catch(()=>{}).then(async()=>{
      if(!active)return
      if(source.length>20000)throw new Error('Diagram too large')
      const {default:mermaid}=await import('mermaid')
      mermaid.initialize({theme:theme==='dark'?'dark':'default',startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,maxTextSize:20000,maxEdges:500,secure:['securityLevel','startOnLoad','maxTextSize','maxEdges','secure']})
      const result=await mermaid.render('localDiagram'+crypto.randomUUID().replaceAll('-',''),source)
      if(!active)return
      owned=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}));setUrl(owned)
    })
    queue=job;void job.catch(()=>active&&setError(true))
    return()=>{active=false;if(owned)URL.revokeObjectURL(owned)}
  },[source,theme])
  return url?<img src={url} alt={ft('Mermaid diagram')} style={{maxWidth:'100%',height:'auto'}}/>:error?<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{source}</pre>:<span data-export-pending="true">{ft('Rendering diagram')}</span>
}
