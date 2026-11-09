/** Derived index bytes are local caches, not caller-visible source documents. */
export const isRagInternal=(path:string)=>/^\.chatbox\/rag(?:\/|$)/i.test(path)
export const canIndexRagScope=(sessionScope:string|undefined,assetScope:string|undefined)=>!assetScope||assetScope==='public'||assetScope===(sessionScope||'public')
export function assertRagSourcePath(path:string){if(isRagInternal(path))throw Error('RAG index files are managed by the app')}
