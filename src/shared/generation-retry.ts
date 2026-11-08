export interface FailedGeneration { id:string;kind:string;model:string;error:string }
/** One explicit retry decision per failed job and user turn; parallel/repeated calls cannot reopen it. */
export class GenerationRetryGate {
  private readonly decisions=new Set<string>()
  async allow(scope:string,failure:FailedGeneration,confirm:(failure:FailedGeneration)=>Promise<boolean>){
    const key=JSON.stringify([scope,failure.id])
    if(this.decisions.has(key))return false
    this.decisions.add(key)
    while(this.decisions.size>500)this.decisions.delete(this.decisions.values().next().value!)
    return await confirm(failure)
  }
}
