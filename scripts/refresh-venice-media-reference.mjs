import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const source='https://github.com/veniceai/api-docs/blob/main/data/model-catalog.json'
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0

/** Public documented quotes only. Never performs authenticated pricing requests. */
export function buildMediaReference(catalog) {
 const models={},pages={}
 for(const model of Object.values(catalog.models||{})) {
  if(model.family)pages[model.id]=model.family
  const price=model.pricing||{},base={quotedAt:price.quotedAt||catalog.generatedAt}
  if(model.type==='video') {
   const quotes=Object.entries(price.quotes||{}).flatMap(([key,amount])=>{
    const [resolution,duration,audio]=key.split('|'),seconds=Number(duration?.replace(/s$/,''))
    return finite(amount)&&seconds>0?[{resolution,seconds,audio,amount}]:[]
   })
   const height=value=>value==='4k'?2160:value==='2k'?1440:Number(value.replace(/p$/,''))
   const sizes=quotes.map(quote=>height(quote.resolution)).filter(Number.isFinite)
   const preferred=sizes.includes(720)?720:sizes.some(size=>size>=720)?Math.min(...sizes.filter(size=>size>=720)):Math.max(...sizes)
   quotes.sort((a,b)=>{
    const distance=row=>height(row.resolution)===preferred?0:row.resolution==='-'?100000:Math.abs(height(row.resolution)-preferred)+1000
    return distance(a)-distance(b)||Math.abs(a.seconds-5)-Math.abs(b.seconds-5)||Number(b.audio==='on')-Number(a.audio==='on')
   })
   const quote=quotes[0]
   if(quote)models[model.id]={...base,amount:quote.amount*5/quote.seconds,basis:'video',resolution:quote.resolution==='-'?'default':quote.resolution,sourceSeconds:quote.seconds,normalized:quote.seconds!==5,audio:quote.audio}
  } else if(['tts','asr','stt','music','audio'].includes(model.type)) {
   if(finite(price.per1MChars))models[model.id]={...base,amount:price.per1MChars*413/1000000,basis:'audio',speechEstimate:true}
   else if(finite(price.perTrack))models[model.id]={...base,amount:price.perTrack,basis:'track'}
   else if(Array.isArray(price.tiers)) {
    const tier=price.tiers.find(tier=>finite(tier.usd)&&Number(tier.from??0)<=30&&Number(tier.upTo)>=30)
    if(tier)models[model.id]={...base,amount:tier.usd,basis:'audio',sourceSeconds:30}
    else {const first=price.tiers.filter(tier=>finite(tier.usd)&&Number(tier.upTo)>0).sort((a,b)=>a.upTo-b.upTo)[0];if(first)models[model.id]={...base,amount:first.usd*30/first.upTo,basis:'audio',sourceSeconds:first.upTo,normalized:true}}
   } else if(finite(price.perSecond))models[model.id]={...base,amount:price.perSecond*30,basis:'audio'}
   else if(finite(price.perMinute))models[model.id]={...base,amount:price.perMinute/2,basis:'audio'}
  }
 }
 return {prices:{generatedAt:catalog.generatedAt,source,assumedSpeechCharacters:413,models},pages:{generatedAt:catalog.generatedAt,source,pages}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const input=process.argv[2]
 const catalog=input?JSON.parse(await readFile(input,'utf8')):await fetch('https://raw.githubusercontent.com/veniceai/api-docs/main/data/model-catalog.json',{signal:AbortSignal.timeout(30000)}).then(response=>{if(!response.ok)throw Error('Public catalog HTTP '+response.status);return response.json()})
 const result=buildMediaReference(catalog)
 if(Object.keys(result.prices.models).length<50)throw Error('Public pricing catalog is incomplete; bundled references were not changed')
 const directory=new URL('../src/shared/providers/definitions/models/venice/',import.meta.url)
 await writeFile(new URL('price-reference.json',directory),JSON.stringify(result.prices)+'\n')
 await writeFile(new URL('model-pages.json',directory),JSON.stringify(result.pages)+'\n')
 console.log('Updated public price references and model-page links. Review the diff before committing.')
}
