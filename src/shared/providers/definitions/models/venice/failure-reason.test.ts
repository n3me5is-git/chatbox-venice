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
 expect((await responseFailureReason(new Response('x'.repeat(1000000)))).length).toBe(8000)
 expect(await responseFailureReason(new Response('<html>error</html>'))).toBe('The provider returned an unreadable error response.')
})
