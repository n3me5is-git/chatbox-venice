import {EncryptedChunkStore,type AssetHeader,type AssetIndex,type CipherBlobStore} from '@/packages/vault/chunk-store'
import {DirectoryDatabase,collectionDigest} from './directory-database'
/** Physical identities stay UUIDs. Alias lookup normalizes the application-local
 * collection ID to the persistent collection UUID, without altering authenticated
 * asset headers or their AAD after a collection is copied to another device. */
export function directoryAssets(database:DirectoryDatabase,key:()=>Promise<CryptoKey>){
 const canonical=(alias:string)=>alias.replace(/^knowledge-collection:-[0-9]+:/,'knowledge-collection:'+database.descriptor.id+':')
 const aliasKey=async(alias:string)=>'aliases/'+await collectionDigest(canonical(alias))
 const get=async(id:string)=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid collection asset identity');const value=await database.get('headers/'+id);return value?JSON.parse(value) as AssetHeader:null}
 const index:AssetIndex={get,byAlias:async alias=>{const id=await database.get(await aliasKey(alias));return id?get(id):null},put:async header=>{await database.set('headers/'+header.id,JSON.stringify(header));if(header.alias&&header.status==='ready')await database.set(await aliasKey(header.alias),header.id)},remove:async id=>{const header=await get(id);if(header?.alias){const name=await aliasKey(header.alias);if(await database.get(name)===id)await database.remove(name)}await database.remove('headers/'+id)},async *all(){for await(const row of database.scan('headers')){const header=JSON.parse(row.value) as AssetHeader;if(row.key!=='headers/'+header.id)throw Error('Invalid collection asset index');yield header}},page:async(scope,cursor,limit)=>{const rows:AssetHeader[]=[];let n=0,more=false;for await(const header of index.all()){if(scope&&header.scope!==scope)continue;if(n++<cursor)continue;if(rows.length>=limit){more=true;break}rows.push(header)}return {items:rows,next:more?cursor+rows.length:null}}}
 const blobs:CipherBlobStore={get:key=>database.get('chunks/'+key),set:(key,value)=>database.set('chunks/'+key,value),remove:key=>database.remove('chunks/'+key),keys:async()=>{const keys:string[]=[];for await(const row of database.scan('chunks'))keys.push(row.key.slice(7));return keys}}
 return new EncryptedChunkStore(blobs,index,async()=>{await database.port.check();return key()})
}
