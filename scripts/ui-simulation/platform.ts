const testBlobs=new Map<string,string>()
export default {type:'web',isDesktopLike:false,getStoreBlob:async(key:string)=>testBlobs.get(key)||null,setStoreBlob:async(key:string,value:string)=>{testBlobs.set(key,value)},delStoreBlob:async(key:string)=>{testBlobs.delete(key)},listStoreBlobKeys:async()=>[...testBlobs.keys()],getStoreValue:async()=>null,getImageGenerationStorage:()=>({getById:async()=>null}),openLink:async()=>{},exporter: {
  exportTextFile: async (name: string, text: string) => { (window as any).__simulationExport = { name, size: text.length } },
  exportBlob: async (name: string, blob: Blob) => { (window as any).__simulationExport = { name, size: blob.size } },
} }
