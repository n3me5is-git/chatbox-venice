import type {RagChunk} from '../../src/shared/session-rag'
export {unpackRagShard,unpackRagChunk} from '../../src/shared/rag-vector-storage'

/** Benchmark-only writer control. The production reader, retrieval, source
 * checks, model fixtures and authenticated storage are unchanged. No app setting
 * or runtime provider can activate this module. */
export function packRagShard(chunks:readonly RagChunk[]){
 if(chunks.length>32)throw Error('Invalid RAG shard')
 return [...chunks]
}
