import { sessionFilePath } from './session-resources'
export interface LinkedFile { path: string; bytes: number; modified: number; version: string }
export interface FolderStatus { linked: boolean; name?: string; inherited?: boolean; bindingId?: string }
export interface FolderReply extends FolderStatus { files?: LinkedFile[]; skipped?: string[]; directories?: string[]; truncated?: boolean; children?:string[]; exists?:boolean; databaseWritable?:boolean; base64?: string; version?: string }
export interface FolderRequest { sessionId: string; action: 'status'|'pick'|'unlink'|'inherit'|'list'|'read'|'write'|'remove'|'mkdir'|'database-list'|'database-read'|'database-write'|'database-remove'; database?:boolean; parentId?: string; bindingId?: string; path?: string; base64?: string; expectedVersion?: string|null }
export function linkedPath(path: string) { sessionFilePath(path); if(path.split('/').some(part=>['.chatbox','.rag-collection'].includes(part.toLowerCase())))throw Error('Reserved workspace path'); return path }
export function folderIdentity(id: string) { if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('Invalid session identity'); return id }
export function mountKey(id: string,path: string,version: string) { return 'linked:'+encodeURIComponent(id)+':'+encodeURIComponent(path)+':'+version }
export function parseMountKey(key: string) { if(!key.startsWith('linked:'))return null;const match=/^linked:([^:]+):([^:]+):([A-Za-z0-9_-]+)~([a-f0-9]{64})$/.exec(key);if(!match)throw Error('Invalid linked file version');return {sessionId:folderIdentity(decodeURIComponent(match[1])),path:linkedPath(decodeURIComponent(match[2])),bindingId:match[3],version:match[4]} }

/** Only the owner-controlled collection backend may address this reserved subtree. */
export function collectionDatabasePath(value:string){if(value!=='.rag-collection'&&!/^\.rag-collection\/(?:collection\.json|v1(?:\/records(?:\/(?:headers|aliases|chunks|values)(?:\/[a-f0-9]{64}(?:\/(?:[a-f0-9-]{36}\.json|[0-9]{12}_[a-f0-9-]{36}\.commit))?)?)?)?)?)$/.test(value))throw Error('Invalid collection database path');return value}
