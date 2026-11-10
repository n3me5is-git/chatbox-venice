export type ArchiveBlobRequest={id:string;action:'get'|'set'|'remove'|'keys';key?:string;value?:string}
let bridge:((request:Omit<ArchiveBlobRequest,'id'>)=>Promise<unknown>)|undefined
export function setArchiveBlobBridge(value:typeof bridge){bridge=value}
export async function archiveBlobRequest<T>(request:Omit<ArchiveBlobRequest,'id'>):Promise<{handled:false}|{handled:true;value:T}>{return bridge?{handled:true,value:await bridge(request) as T}:{handled:false}}
