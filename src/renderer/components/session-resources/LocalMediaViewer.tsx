import { forkT as ft } from '@/i18n/fork'
/** Shared local viewer for the explorer and chat artifacts. Nothing plays automatically. */
export function LocalMediaViewer({name,mime,url}:{name:string;mime:string;url:string}) {
  if(mime.startsWith('image/'))return <img src={url} alt={name} style={{maxWidth:'100%',maxHeight:'65dvh',height:'auto',objectFit:'contain'}}/>
  if(mime.startsWith('audio/'))return <audio aria-label={ft('Generated audio')} controls preload="metadata" src={url} style={{width:'100%'}}/>
  if(mime.startsWith('video/'))return <video aria-label={ft('Generated video')} controls playsInline preload="metadata" src={url} style={{width:'100%',maxHeight:'60dvh',objectFit:'contain'}}/>
  return null
}
