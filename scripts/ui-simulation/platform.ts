const testBlobs=new Map<string,string>()
const testValues=new Map<string,unknown>()
export default {type:'web',isDesktopLike:false,appLog:async()=>{},getStorageType:()=> 'memory',setStoreValue:async(key:string,value:unknown)=>{testValues.set(key,structuredClone(value))},getStoreBlob:async(key:string)=>testBlobs.get(key)||null,setStoreBlob:async(key:string,value:string)=>{testBlobs.set(key,value)},delStoreBlob:async(key:string)=>{testBlobs.delete(key)},listStoreBlobKeys:async()=>[...testBlobs.keys()],getStoreValue:async(key:string)=>structuredClone(testValues.get(key)??null),getImageGenerationStorage:()=>({getById:async()=>null}),openLink:async()=>{},exporter: {
  exportTextFile: async (name: string, text: string) => { (window as any).__simulationExport = { name, size: text.length } },
  exportBlob: async (name: string, blob: Blob) => { (window as any).__simulationExport = { name, size: blob.size };if(name.endsWith('.html'))(window as any).__simulationExportHTML=await blob.text() },
} }
