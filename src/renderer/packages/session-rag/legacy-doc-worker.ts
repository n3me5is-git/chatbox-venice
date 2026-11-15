import {KNOWLEDGE_BASE_MAX_FILE_SIZE,KNOWLEDGE_SOURCE_TOO_LARGE} from '@shared/knowledge-base'
import docToText from './vendor/docToText.js'
self.onmessage=(event:MessageEvent<Uint8Array>)=>{try{if(event.data.byteLength>KNOWLEDGE_BASE_MAX_FILE_SIZE)throw Error(KNOWLEDGE_SOURCE_TOO_LARGE);const text=docToText(event.data);if(text===null)throw Error('This legacy Word document is encrypted, corrupt or unsupported');if(text.length>500000)throw Error('Document text exceeds the indexing limit');self.postMessage({text})}catch(error){self.postMessage({error:(error as Error).message})}}
