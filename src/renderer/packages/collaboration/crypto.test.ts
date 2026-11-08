import {describe,it,expect} from 'vitest'
import {keyPair,channel,connectionNonce,makeInvitation,encodeInvitation,parseInvitation,fingerprint} from './crypto'
describe('collaboration authenticated encryption',()=>{
  it('round-trips invitations without accepting truncated or malformed codes',async()=>{
    const owner=await keyPair(),invite=makeInvitation(owner.publicKey),code=encodeInvitation(invite)
    expect(parseInvitation(code)).toEqual(invite);expect(parseInvitation('https://example.test/#'+code)).toEqual(invite)
    expect(code.startsWith('CB2.')).toBe(true);expect(()=>parseInvitation(code.slice(0,-20))).toThrow();expect(()=>parseInvitation('CB1.invalid')).toThrow('Update both apps')
    expect((await fingerprint(owner.publicKey)).length).toBe(32)
  })
  it('encrypts both directions and rejects tampering, replays, a wrong owner and a previous connection',async()=>{
    const [host,guest,attacker]=await Promise.all([keyPair(),keyPair(),keyPair()]),invite=makeInvitation(host.publicKey),clientNonce=connectionNonce(),hostNonce=connectionNonce()
    const a=await channel(host,guest.publicKey,invite,clientNonce,hostNonce,true),b=await channel(guest,host.publicKey,invite,clientNonce,hostNonce,false)
    const frame=await a.seal({message:'Private content'});expect(JSON.stringify(frame)).not.toContain('Private content');expect(await b.open(frame)).toEqual({message:'Private content'});await expect(b.open(frame)).rejects.toThrow()
    expect(await a.open(await b.seal({answer:42}))).toEqual({answer:42})
    const evil=await channel(attacker,guest.publicKey,invite,clientNonce,hostNonce,true),next=await evil.seal({spoofed:true});await expect(b.open({...next,seq:2})).rejects.toThrow()
    const fresh=await channel(guest,host.publicKey,invite,connectionNonce(),connectionNonce(),false);await expect(fresh.open(frame)).rejects.toThrow()
    const valid=await a.seal({safe:true});await expect(b.open({...valid,data:valid.data.slice(0,-4)+'AAAA'})).rejects.toThrow();expect(await b.open(valid)).toEqual({safe:true})
  })
})
