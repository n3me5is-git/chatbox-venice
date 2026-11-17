import type {DerivedImage,DerivedImageSink} from '@shared/knowledge-derivatives'
import {stripImageMetadata} from '@shared/rag-file-metadata'
import type {RagSource} from '@shared/session-rag-engine'
import type {RagSettings} from '@shared/session-rag'
const encode=(bytes:Uint8Array)=>{let out='';for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(out)}
/** Local-only derivation. Page previews preserve vector diagrams and composition
 * even when a PDF image object cannot be decoded separately. */
export async function deriveRagImages(source:RagSource,bytes:Uint8Array,settings:RagSettings,signal:AbortSignal,sink:DerivedImageSink){
 const assets:DerivedImage[]=[],seen=new Set<string>();let omitted=false
 const capture=async(url:string,meta:{kind:'page'|'image';page?:number})=>{signal.throwIfAborted();if(assets.length>=96){omitted=true;return}const asset=await sink(url,meta);if(!asset){omitted=true;return}const key=asset.id+':'+asset.kind+':'+asset.page;if(!seen.has(key)){seen.add(key);assets.push(asset)}}
 if(/^image\/(png|jpeg|webp)$/.test(source.mime))await capture('data:'+source.mime+';base64,'+encode(stripImageMetadata(bytes,source.mime)),{kind:'image'})
 else if(source.mime==='application/pdf'||/\.pdf$/i.test(source.path)){
  const {pdfPagesForOcr}=await import('@/packages/pdf-parser'),file=new File([Uint8Array.from(bytes)],source.name||'document.pdf',{type:'application/pdf'})
  let count=0;for await(const page of pdfPagesForOcr(file,signal,undefined,{images:true,onlyGraphics:true})){await capture(page.dataUrl,{kind:'page',page:page.page});for(const image of page.images||[])await capture(image,{kind:'image',page:page.page});if(++count>=50||assets.length>=96){omitted=true;break}}
 }
 return{assets,assetsVersion:1 as const,...(omitted?{assetWarning:'Some derived images exceeded the preview storage limit. Open the original document for complete content.'}:{})}
}
