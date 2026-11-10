import type {KnowledgeBaseController} from './interface'
import type {KnowledgeBase,KnowledgeBaseFile} from '@shared/types'
import {isPortableCollection} from '@/packages/knowledge-collections/store'
import {RagSettingsSchema} from '@shared/session-rag'
import {parseKnowledgeBaseModelString} from '@shared/utils/knowledge-base-model-parser'
const service=async()=>(await import('@/packages/knowledge-collections/service')).knowledgeCollections
let originalDesktopController:KnowledgeBaseController|undefined
export const legacyKnowledgeController=()=>originalDesktopController
/** Preserve legacy desktop IDs and route new, negative IDs through the shared encrypted backend. */
export function portableKnowledgeController(legacy?:KnowledgeBaseController):KnowledgeBaseController{
 if(legacy)originalDesktopController=legacy
 const missing=()=>{throw Error('Legacy desktop collections must be migrated on their original device')}
 const old=()=>legacy||missing()
 const controller:KnowledgeBaseController={
  list:async()=>{const current=await(await service()).list();return [...current.map(item=>({id:item.id,name:item.name,embeddingModel:item.settings?item.settings.provider+':'+item.settings.model:'',rerankModel:'',createdAt:item.createdAt})),...await(legacy?.list()||Promise.resolve([])).catch(()=>[])]},
  create:async input=>{const parsed=parseKnowledgeBaseModelString(input.embeddingModel);if(!parsed)throw Error('Choose an embedding model');await(await service()).create(input.name,RagSettingsSchema.parse({provider:parsed.providerId,model:parsed.modelId}))},
  delete:async id=>isPortableCollection(id)?(await service()).remove(id):old().delete(id),
  listFiles:async id=>{if(!isPortableCollection(id))return old().listFiles(id);const store=await service();await store.authorize(id);const data=await store.data(id),index=await store.indexStatus(id);return data.files.map(file=>{const indexed=index?.files.find(item=>item.path===file.path),error=index?.errors.find(item=>item.path===file.path)?.error;return {id:file.id,kb_id:id,filename:file.name,filepath:file.path,mime_type:file.mime,file_size:file.bytes,chunk_count:indexed?.chunks||0,total_chunks:indexed?.chunks||0,status:error?'failed':indexed?'done':'pending',error:error||'',createdAt:file.createdAt,parsed_remotely:0,parser_type:'local'} satisfies KnowledgeBaseFile})},
  countFiles:async id=>isPortableCollection(id)?(await controller.listFiles(id)).length:old().countFiles(id),
  listFilesPaginated:async(id,offset=0,limit=20)=>isPortableCollection(id)?(await controller.listFiles(id)).slice(offset,offset+limit):old().listFilesPaginated(id,offset,limit),
  uploadFile:async(id,file)=>{if(!isPortableCollection(id))return old().uploadFile(id,file);throw Error('Use the encrypted knowledge collection file picker')},
  deleteFile:async fileId=>{for(const item of await(await service()).list())if(!item.locked&&(await(await service()).data(item.id)).files.some(file=>file.id===fileId)){await(await service()).removeFile(item.id,fileId);return}return old().deleteFile(fileId)},
  retryFile:async fileId=>{for(const item of await(await service()).list())if(!item.locked&&(await(await service()).data(item.id)).files.some(file=>file.id===fileId)){await(await service()).index(item.id);return}return old().retryFile(fileId)},
  pauseFile:async fileId=>{for(const item of await(await service()).list())if(!item.locked&&(await(await service()).data(item.id)).files.some(file=>file.id===fileId)){(await service()).cancel(item.id);return}return old().pauseFile(fileId)},
  resumeFile:async fileId=>controller.retryFile(fileId),
  search:async(id,query)=>{if(!isPortableCollection(id))return old().search(id,query);const store=await service();await store.authorize(id);const found=await store.search(id,query),chunks=await store.chunks(id,new Set(found.matches.map(hit=>hit.id)));return found.matches.flatMap(hit=>{const row=chunks.find(row=>row.chunk.id===hit.id);return row?[{id:row.chunkIndex,score:hit.score,text:row.text,fileId:row.fileId,filename:row.filename,mimeType:row.chunk.modality||'text/plain',chunkIndex:row.chunkIndex}]:[]})},
  update:async input=>{if(!isPortableCollection(input.id))return old().update(input);const store=await service(),data=await store.data(input.id);await store.configure(input.id,input.name||data.name,data.settings)},
  getFilesMeta:async(id,fileIds)=>isPortableCollection(id)?(await controller.listFiles(id)).filter(file=>fileIds.includes(file.id)).map(file=>({id:file.id,kbId:id,filename:file.filename,mimeType:file.mime_type,fileSize:file.file_size,chunkCount:file.chunk_count,totalChunks:file.total_chunks,status:file.status,createdAt:file.createdAt})):old().getFilesMeta(id,fileIds),
  readFileChunks:async(id,chunks)=>{if(!isPortableCollection(id))return old().readFileChunks(id,chunks);const store=await service();await store.authorize(id);return (await store.chunks(id,chunks)).map(({chunk,...row})=>row)},
  testMineruConnection:async token=>old().testMineruConnection(token),
 };return controller
}
