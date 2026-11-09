import { sessionFilePath } from './session-resources'
export interface LinkedFile { path: string; bytes: number; modified: number; version: string }
export interface FolderStatus { linked: boolean; name?: string; inherited?: boolean; bindingId?: string }
export interface FolderReply extends FolderStatus { files?: LinkedFile[]; skipped?: string[]; directories?: string[]; truncated?: boolean; base64?: string; version?: string }
export interface FolderRequest { sessionId: string; action: 'status'|'pick'|'unlink'|'inherit'|'list'|'read'|'write'|'remove'|'mkdir'; parentId?: string; bindingId?: string; path?: string; base64?: string; expectedVersion?: string|null }
export function linkedPath(path: string) { sessionFilePath(path); if(path.split('/').some(part=>part.toLowerCase()==='.chatbox'))throw Error('Reserved workspace path'); return path }
export function folderIdentity(id: string) { if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('Invalid session identity'); return id }
export function mountKey(id: string,path: string,version: string) { return 'linked:'+encodeURIComponent(id)+':'+encodeURIComponent(path)+':'+version }
export function parseMountKey(key: string) { const match=/^linked:([^:]+):([^:]+):([^:]+)$/.exec(key);return match?{sessionId:decodeURIComponent(match[1]),path:decodeURIComponent(match[2]),bindingId:match[3].split('~')[0],version:match[3].split('~')[1]}:null }
