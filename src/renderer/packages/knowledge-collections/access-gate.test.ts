import {expect,it,vi} from 'vitest'
import {KnowledgeAccessGate} from './access-gate'
it('waits for active readers before publishing and gives the queued writer priority over new readers',async()=>{
 const gate=new KnowledgeAccessGate(),events:string[]=[];let finish!:()=>void
 const first=gate.read(async()=>{events.push('read');await new Promise<void>(resolve=>finish=resolve)});await vi.waitFor(()=>expect(finish).toBeDefined())
 const writing=gate.publish(async()=>{events.push('publish')}),second=gate.read(async()=>{events.push('next-read')});expect(events).toEqual(['read']);finish();await Promise.all([first,writing,second]);expect(events).toEqual(['read','publish','next-read'])
})
