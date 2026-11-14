import type {KnowledgeReviewBoundary} from './publication'
import type {ModelMessage} from 'ai'
import type {CallChatCompletionOptions,ModelInterface} from '@shared/models/types'
import type {SessionSettings,Message} from '@shared/types'
/** Non-streaming consumers (workers and external conversation tools) use the
 * same publication boundary as the main chat, without changing auxiliary calls. */
export async function chatWithKnowledgeReview(model:ModelInterface,messages:ModelMessage[],settings:SessionSettings,options:CallChatCompletionOptions,boundary?:KnowledgeReviewBoundary){
 if(!settings.knowledgeVerification?.enabled)return model.chat(messages,options)
 if(!options.sessionId)throw Error('Knowledge verification requires a chat session')
 const signal=options.signal||new AbortController().signal,{createChatKnowledgePublication}=await import('./publication'),publication=await createChatKnowledgePublication(options.sessionId,settings,signal,boundary),id=crypto.randomUUID()
 const result=await model.chat(messages,{...options,onResultChange:value=>options.onResultChange?.({...value,...(value.contentParts?{contentParts:publication!.project({id,role:'assistant',contentParts:value.contentParts}).contentParts}:{})})})
 signal.throwIfAborted();const checked=await publication!.finish({id,role:'assistant',contentParts:result.contentParts} as Message);signal.throwIfAborted();return {...result,contentParts:checked.contentParts}
}
