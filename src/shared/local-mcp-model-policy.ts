import type {LocalMCPApplication} from './local-mcp'
import type {SessionSettings,Settings} from './types'
/** Apply an endpoint's provider/minimum transport policy before any worker or guardian call. */
export function localMCPModelSettings(application:LocalMCPApplication|undefined,settings:SessionSettings,providers:Settings['providers']):SessionSettings{
  if(!application)return settings
  if(!settings.provider||application.providers&&!application.providers.includes(settings.provider))throw Error('This model provider is outside the MCP endpoint permissions')
  if(application.privacy==='auto')return settings
  if(settings.provider!=='venice')throw Error('This MCP endpoint requires a protected Venice model')
  const configured=providers?.venice,model=[...(configured?.catalogModels||[]),...(configured?.models||[])].find(model=>model.modelId===settings.modelId),capabilities=model?.vendorMetadata?.capabilities as Record<string,unknown>|undefined
  const encrypted=capabilities?.supportsE2EE===true,attested=capabilities?.supportsTeeAttestation===true
  if(application.privacy==='e2ee'&&!encrypted||application.privacy==='tee'&&!encrypted&&!attested)throw Error('This model does not meet the MCP endpoint privacy requirement. Refresh its catalog or choose an allowed model.')
  return {...settings,veniceSecurity:{...settings.veniceSecurity,textPrivacy:encrypted?'e2ee':'tee',e2eeToolsEnabled:true,e2eeToolMode:'encrypted-text'}}
}
