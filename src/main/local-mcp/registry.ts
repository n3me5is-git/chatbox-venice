import {LocalMCPServer,type LocalMCPBackend} from './server'
import {localMCPEndpointId,LocalMCPStartSchema,type LocalMCPStart,type LocalMCPGrant} from '../../shared/local-mcp'
/** One independently revocable token and loopback listener per endpoint. */
export class LocalMCPRegistry {
  private servers=new Map<string,LocalMCPServer>()
  constructor(private backend:LocalMCPBackend,private revoked:(grant:LocalMCPGrant)=>void=()=>{}){}
  list(){return [...this.servers.values()].map(server=>server.state()).filter((state):state is LocalMCPGrant=>state.running)}
  state(id?:string){return (id ? this.servers.get(id)?.state() : this.list().find(grant=>!grant.application))||{running:false as const}}
  chatState(sessionId: string) { return this.state('chat:'+sessionId) }
  shares() { return this.list().filter(grant => !grant.application).map(grant => ({sessionId:grant.sessionId,port:Number(new URL(grant.url).port)})) }
  async start(input:LocalMCPStart, accessToken?:string){
    const config=LocalMCPStartSchema.parse(input),id=localMCPEndpointId(config)
    if(!id)throw Error('An application endpoint needs its own identity')
    if(this.servers.has(id))throw Error('Stop this endpoint before changing its permissions')
    if(this.servers.size>=8)throw Error('Stop an endpoint before starting another (maximum 8)')
    const server=new LocalMCPServer(this.backend)
    const state=await server.start(config,accessToken)
    this.servers.set(id,server);return state
  }
  async stop(id?:string){
    if (!id || id === 'chat') {
      const share = this.list().find(grant => !grant.application)
      if (!share) return
      id = 'chat:' + share.sessionId
    }
    const server=this.servers.get(id);if(!server)return
    const grant=server.state();this.servers.delete(id)
    if(grant.running){const {accessToken: _credential,...internal}=grant;this.revoked(internal)}
    await server.stop()
  }
  async stopShares(){await Promise.all(this.shares().map(share => this.stop('chat:'+share.sessionId)))}
  async suspendForLock(){await Promise.all(this.list().filter(grant=>!grant.keepWhileLocked).map(grant=>this.stop(localMCPEndpointId(grant))))}
  async stopAll(){await Promise.all([...this.servers.keys()].map(id=>this.stop(id)))}
}
