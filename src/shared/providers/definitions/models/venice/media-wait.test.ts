import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaRecord } from './media'
import { waitForMediaRecord } from './media-wait'
const record: MediaRecord={id:'one',kind:'video',model:'video',prompt:'test',sessionId:'chat',createdAt:1,status:'queued',origin:'https://example.com',credentialId:'not-a-secret'}
function fixture(){let row:MediaRecord|null={...record};const listeners=new Set<()=>void>();return {source:{read:vi.fn(async()=>row),subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}},change:(value:MediaRecord|null)=>{row=value;for(const listener of listeners)listener()},listeners}}
afterEach(()=>vi.useRealTimers())
describe('bounded media wait without provider calls',()=>{
 it('finishes when the existing background job completes and removes its subscription',async()=>{const f=fixture();const waiting=waitForMediaRecord(f.source);await Promise.resolve();f.change({...record,status:'ready',blobKey:'local'});expect(await waiting).toMatchObject({timedOut:false,record:{status:'ready',blobKey:'local'}});expect(f.listeners.size).toBe(0)})
 it('returns pending at the deadline without restarting or stopping the job',async()=>{vi.useFakeTimers();const f=fixture();const waiting=waitForMediaRecord(f.source,30000);await vi.advanceTimersByTimeAsync(30000);expect(await waiting).toMatchObject({timedOut:true,record:{status:'queued'}});expect(f.listeners.size).toBe(0)})
 it.each(['error','paused'] as const)('returns %s immediately so failure cannot become a generation retry loop',async(status)=>{const f=fixture();f.change({...record,status,error:'reason'});expect(await waitForMediaRecord(f.source)).toMatchObject({timedOut:false,record:{status,error:'reason'}});expect(f.listeners.size).toBe(0)})
 it('cancels immediately on user stop or privacy lock and detaches listeners',async()=>{const f=fixture(),abort=new AbortController();const waiting=waitForMediaRecord(f.source,30000,abort.signal);abort.abort();await expect(waiting).rejects.toThrow();expect(f.listeners.size).toBe(0)})
 it('rejects deleted and locked records without exposing their old data',async()=>{const f=fixture();f.change(null);await expect(waitForMediaRecord(f.source)).rejects.toThrow('no longer available');f.change({...record,protectedRecord:true,prompt:''});await expect(waitForMediaRecord(f.source)).rejects.toThrow('Unlock');expect(f.listeners.size).toBe(0)})
})
