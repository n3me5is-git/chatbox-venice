const origins=new WeakMap<File,{scope:string;key:string}>()
export function markLocalFile(file:File,origin:{scope:string;key:string}){origins.set(file,origin);return file}
export const localFileOrigin=(file:File|null|undefined)=>file?origins.get(file):undefined
export function inheritLocalFile(source:File,copy:File){const origin=origins.get(source);return origin?markLocalFile(copy,origin):copy}
