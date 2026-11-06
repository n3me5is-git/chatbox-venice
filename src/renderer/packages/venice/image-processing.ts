import { processVeniceImage,type ImageOperation } from '@shared/providers/definitions/models/venice/image-processing'
import type { MediaCatalogItem } from '@shared/providers/definitions/models/venice/media'
import { veniceConfiguration } from './service'
import { createModelDependencies } from '@/adapters'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { responseBytes } from '@/packages/vault/chunk-store'
import { readMediaBytes,mediaDataUrl } from '@shared/providers/definitions/models/venice/media'
import platform from '@/platform'
import { queryClient } from '@/stores/queryClient'
import { assertVeniceEnabled } from '@shared/providers/definitions/models/venice/options'
export async function fetchImageToolCatalog(configuration=veniceConfiguration()){
 assertVeniceEnabled(configuration.options);if(!configuration.apiKey)throw Error('Configure a Venice API key first')
 const response=await(await createModelDependencies()).request.apiRequest({url:(configuration.apiHost||'https://api.venice.ai/api/v1').replace(/\/+$/,'')+'/models?type=upscale',method:'GET',headers:{Authorization:'Bearer '+configuration.apiKey},useProxy:false})
 if(!response.ok)throw Error('Unable to load current image tool pricing')
 const data=await response.json();if(!Array.isArray(data.data))throw Error('Invalid Venice model catalog');return data.data as MediaCatalogItem[]
}
export async function runVeniceImageTool(input:{file:File;operation:ImageOperation;scale?:2|4;creativity?:number;protection?:string;title:string;catalog?:MediaCatalogItem[]},signal:AbortSignal){
 const vault=vaultRuntimeFor(platform),storage=platform.getImageGenerationStorage(),configuration=veniceConfiguration()
 const current=input.operation==='upscale'?await fetchImageToolCatalog(configuration):[]
 return processVeniceImage({...input,metadata:current.find(model=>model.type==='upscale')?.model_spec},configuration,{
  ensure:async scope=>{await storage.initialize();const available=await vault.available();if(!available&&(platform.type!=='web'||scope!=='public'))throw Error('Device encryption is unavailable');if(available)await vault.keys.key(scope)},
  create:record=>storage.create(record),
  update:async(id,patch)=>{const result=await storage.update(id,patch);void queryClient.invalidateQueries({queryKey:['image-generation-list']});void queryClient.invalidateQueries({queryKey:['image-generation',id]});return result},
  save:async(record,response,mime,signal)=>{
   const key=`picture:image-gen:${record.id}:${crypto.randomUUID()}`
   if(await vault.available())await vault.assets.put(responseBytes(response,signal),{name:record.prompt,mime,kind:'image',model:record.model.modelId,sourceId:record.id},record.protection||'public',key,signal)
   else {const bytes=await readMediaBytes(response);try{signal.throwIfAborted();await platform.setStoreBlob(key,mediaDataUrl(bytes,mime))}finally{bytes.fill(0)}}
   return key
  },
 },(await createModelDependencies()).request.apiRequest,signal)
}
