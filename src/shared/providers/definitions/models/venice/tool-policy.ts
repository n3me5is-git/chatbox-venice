import type { ProviderSettings } from '../../../../types'
type Options=NonNullable<ProviderSettings['venice']>
export function veniceToolsVisible(provider:string|undefined,options:Options={}){return provider==='venice'||options.chatToolsVeniceOnly!==true}
export function veniceToolsEnabled(provider:string|undefined,sessionEnabled:boolean|undefined,options:Options={}){return options.enabled!==false&&options.chatToolsEnabled!==false&&veniceToolsVisible(provider,options)&&(sessionEnabled??provider==='venice')}
