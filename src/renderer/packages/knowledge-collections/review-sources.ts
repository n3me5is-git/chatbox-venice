import { knowledgeEvidenceUrl } from '@shared/knowledge-evidence'
import type { KnowledgeCheckSource, KnowledgeReviewRetriever } from '@shared/knowledge-verification'
import { knowledgeCollections } from './service'

export type ReviewSourceBinding = { collectionId: number; path: string; sourceHash: string }
export type ReviewSourceApproval = (query: string, sources: readonly KnowledgeCheckSource[]) => Promise<void>
type Reference = { collectionId: number; fileId: number; id: string }

export async function readReviewSource(ref: Reference, maxCharacters: number) {
  await knowledgeCollections.assert(ref.collectionId)
  const receipt = await knowledgeCollections.readEvidence(ref.collectionId, ref.fileId, ref.id)
  if (receipt.stale) throw Error('Knowledge source changed during verification')
  const file = (await knowledgeCollections.data(ref.collectionId)).files.find(row => row.id === ref.fileId)
  if (!file) throw Error('Knowledge document not found')
  const spare = Math.max(0, maxCharacters - receipt.quote.length - 2)
  const beforeCount = Math.floor(spare/2)
  const before = beforeCount ? receipt.before.slice(-beforeCount) : ''
  const after = receipt.after.slice(0,Math.ceil(spare/2))
  const source: KnowledgeCheckSource = {
    id: receipt.id, origin:'knowledge', url:knowledgeEvidenceUrl(ref.collectionId,ref.fileId,ref.id),
    name:receipt.name,
    content:[before,receipt.quote,after].filter(Boolean).join('\n'),
  }
  const binding: ReviewSourceBinding = {collectionId:ref.collectionId,path:file.path,sourceHash:receipt.sourceHash}
  return { source, binding }
}

/** Follow-up lookups stay in the exact collections already used in this review. */
export function createReviewRetriever(
  ids: readonly number[],
  check: () => Promise<void>,
  bindings: ReviewSourceBinding[],
  approve?: ReviewSourceApproval,
): KnowledgeReviewRetriever | undefined {
  const collections = [...new Set(ids)].slice(0,8)
  if (!collections.length) return
  return async (query, known, signal) => {
    const budget = 64000-known.reduce((sum,source)=>sum+source.content.length,0)
    const limit = Math.min(3,32-known.length)
    if (!limit || budget <= 0) return []
    const seen = new Set(known.map(source=>source.id))
    const lanes = []
    for (const collectionId of collections) {
      signal.throwIfAborted()
      await check()
      const hits = await knowledgeCollections.searchReviewPassages(collectionId,query,signal)
      const rows = await knowledgeCollections.chunksForMatches(collectionId,hits)
      lanes.push(hits.flatMap(hit=>{
        const row=rows.find(chunk=>chunk.chunk.id===hit.id)
        return row?.text.trim()?[{collectionId,fileId:row.fileId,chunkIndex:row.chunkIndex,text:row.text}]:[]
      }))
    }
    const collected: Awaited<ReturnType<typeof readReviewSource>>[] = []
    let remaining = budget
    for (let rank=0;rank<6 && collected.length<limit;rank++) {
      for (const lane of lanes) {
        const item=lane[rank]
        if (!item || collected.length>=limit) continue
        signal.throwIfAborted()
        await check()
        const [receipt]=await knowledgeCollections.citeChunks(item.collectionId,[item])
        if (!receipt || seen.has(receipt.id)) continue
        const candidate=await readReviewSource({collectionId:item.collectionId,fileId:item.fileId,id:receipt.id},Math.min(4000,remaining))
        if (candidate.source.content.length>Math.min(remaining,8000)) continue
        seen.add(candidate.source.id)
        remaining-=candidate.source.content.length
        collected.push(candidate)
      }
    }
    await check()
    const result=collected.map(row=>row.source)
    if (result.length && approve) await approve(query,result)
    signal.throwIfAborted()
    await check()
    bindings.push(...collected.map(row=>row.binding))
    return result
  }
}
