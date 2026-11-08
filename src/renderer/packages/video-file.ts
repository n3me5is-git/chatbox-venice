/** Inspect only local container metadata; no upload and no full audio/video decode. */
export async function videoFileDuration(file:File,signal?:AbortSignal){
  signal?.throwIfAborted()
  const url=URL.createObjectURL(file),video=document.createElement('video')
  video.preload='metadata';video.muted=true;video.playsInline=true
  try{return await new Promise<number>((resolve,reject)=>{
    let finished=false
    const stop=()=>finish(new DOMException('Canceled','AbortError'))
    const timer=setTimeout(()=>finish(new Error('Unable to read the source video duration.')),15000)
    const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);if(error)reject(error);else if(Number.isFinite(video.duration)&&video.duration>0)resolve(video.duration);else reject(new Error('Unable to read the source video duration.'))}
    signal?.addEventListener('abort',stop,{once:true});video.onloadedmetadata=()=>finish();video.onerror=()=>finish(new Error('Unable to read the source video duration.'))
    if(signal?.aborted)stop();else video.src=url
  })}finally{video.onloadedmetadata=null;video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}
