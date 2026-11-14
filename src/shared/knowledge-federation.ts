import {fuseKnowledgeRanks} from './knowledge-augmentation'
import {bm25Score,retrievalTokens} from './knowledge-hybrid'
/** Each collection owns its embedding space. Only bounded ranks/text cross this boundary. */
export function selectedKnowledgeCollections(primary:number|undefined,additional:readonly number[]|undefined){return [...new Set([...(primary===undefined||!Number.isSafeInteger(primary)||primary===0?[]:[primary]),...(additional||[]).filter(id=>Number.isSafeInteger(id)&&id<0)])].slice(0,8)}
export function fuseCollectionCandidates<T extends {id:string;text:string}>(query:string,lanes:T[][],limit=20){
 const all=lanes.flat(),terms=[...new Set(retrievalTokens(query))].slice(0,16),tokens=all.map(row=>retrievalTokens(row.text)),df=terms.map(term=>tokens.filter(row=>row.includes(term)).length),average=tokens.reduce((n,row)=>n+row.length,0)/Math.max(1,tokens.length),lexical=all.map((row,index)=>({...row,lexicalScore:bm25Score(terms.map(term=>tokens[index].filter(token=>token===term).length),df,all.length,tokens[index].length,average)})).filter(row=>row.lexicalScore>0).sort((a,b)=>b.lexicalScore-a.lexicalScore)
 return fuseKnowledgeRanks<T>([lexical,...lanes],limit)
}
