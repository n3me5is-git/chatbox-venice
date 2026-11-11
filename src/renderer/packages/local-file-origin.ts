export type LocalFileOrigin = {scope:string;key:string;contentHash?:string}
const origins=new WeakMap<File,LocalFileOrigin>()
export function markLocalFile(file:File,origin:LocalFileOrigin){origins.set(file,origin);return file}
export const localFileOrigin=(file:File|null|undefined)=>file?origins.get(file):undefined
export function inheritLocalFile(source:File,copy:File){const origin=origins.get(source);return origin?markLocalFile(copy,origin):copy}
