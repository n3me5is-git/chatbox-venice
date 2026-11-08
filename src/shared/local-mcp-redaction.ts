/** Defense in depth for provider errors/tool descriptions; auth fields are never part of the API. */
export function redactLocalMCPResult(value:unknown,settings:unknown){
  const secrets=new Set<string>(),seen=new Set<object>()
  const walk=(node:unknown,depth:number)=>{
    if(!node||typeof node!=='object'||depth>12||seen.has(node))return
    seen.add(node)
    for(const [key,item]of Object.entries(node)){
      if(typeof item==='string'){
        if(/(?:key|token|secret|password|authorization)$/i.test(key)&&item.length>=8)secrets.add(item)
        if(/^https?:\/\//.test(item))try{for(const [name,entry]of new URL(item).searchParams)if(/key|token|secret|password|auth/i.test(name)&&entry.length>=8)secrets.add(entry)}catch{}
      }else walk(item,depth+1)
    }
  }
  walk(settings,0)
  let text=JSON.stringify(value??null)
  for(const secret of [...secrets].sort((a,b)=>b.length-a.length)){const escaped=JSON.stringify(secret).slice(1,-1);text=text.split(escaped).join('[redacted]')}
  return JSON.parse(text) as unknown
}
