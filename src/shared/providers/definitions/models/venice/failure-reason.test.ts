import {it,expect} from 'vitest'
import {failureReason,responseFailureReason} from './failure-reason'
it('preserves the actual HTTP validation reason and nested field errors',async()=>{
 const response=new Response(JSON.stringify({detail:[{loc:['body','duration'],msg:'Choose 5 or 10 seconds'}]}),{status:422})
 expect(await responseFailureReason(response)).toBe('duration: Choose 5 or 10 seconds')
 expect(failureReason('Venice /music/generate failed (HTTP 400): Invalid voice. No paid request was retried.')).toBe('Invalid voice')
 expect(failureReason('{"error":{"message":"Insufficient funds"}}')).toBe('Insufficient funds')
})
it('bounds errors and redacts credentials without rendering HTML',async()=>{
 expect(failureReason('Bearer secret.token and VENICE_INFERENCE_KEY_secret')).toBe('[redacted] and [redacted]')
 let cancelled=false,read=0;const stream=new ReadableStream<Uint8Array>({pull(controller){read+=4096;controller.enqueue(new Uint8Array(4096).fill(120))},cancel(){cancelled=true}})
 expect(await responseFailureReason(new Response(stream))).toBe('The provider returned an unreadable error response.');expect(cancelled).toBe(true);expect(read).toBeLessThanOrEqual(36864)
 expect(failureReason('x'.repeat(1000000)).length).toBe(8000)
 expect(await responseFailureReason(new Response('{"message":"Invalid duration","request":{"prompt":"secret-in-body"}}'))).toBe('Invalid duration')
 expect(await responseFailureReason(new Response('<html>error</html>'))).toBe('The provider returned an unreadable error response.')
})
