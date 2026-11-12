import {LocalMCPServer,type LocalMCPBackend} from './server'
import {LocalMCPStartSchema,type LocalMCPStart,type LocalMCPGrant} from '../../shared/local-mcp'
/** One independently revocable token and loopback listener per endpoint. */
export class LocalMCPRegistry {
  private servers=new Map<string,LocalMCPServer>()
  constructor(private backend:LocalMCPBackend,private revoked:(grant:LocalMCPGrant)=>void=()=>{}){}
  list(){return [...this.servers.values()].map(server=>server.state()).filter((state):state is LocalMCPGrant=>state.running)}
  state(id='chat'){return this.servers.get(id)?.state()||{running:false as const}}
  async start(input:LocalMCPStart){
    const config=LocalMCPStartSchema.parse(input),id=config.application?config.endpointId: 'chat'
    if(!id)throw Error('An application endpoint needs its own identity')
    if(this.servers.has(id))throw Error('Stop this endpoint before changing its permissions')
    if(this.servers.size>=8)throw Error('Stop an endpoint before starting another (maximum 8)')
    const server=new LocalMCPServer(this.backend)
    const state=await server.start(config)
    this.servers.set(id,server);return state
  }
  async stop(id='chat'){
    const server=this.servers.get(id);if(!server)return
    const grant=server.state();this.servers.delete(id)
    if(grant.running)this.revoked(grant)
    await server.stop()
  }
  async stopAll(){await Promise.all([...this.servers.keys()].map(id=>this.stop(id)))}
}
