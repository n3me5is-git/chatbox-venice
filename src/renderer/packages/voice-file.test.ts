import { describe,expect,it } from 'vitest'
import { monoWave,validateVoiceDuration,waveDuration } from './voice-file'
describe('local compatible voice recording',()=>{
 it('writes a real PCM WAV with a duration readable from its small header',()=>{const samples=new Float32Array(24000).fill(0.5);const bytes=monoWave([samples],24000);expect(bytes.length).toBe(48044);expect(waveDuration(bytes.slice(0,44))).toBe(1);const view=new DataView(bytes.buffer);expect(view.getUint16(22,true)).toBe(1);expect(view.getInt16(44,true)).toBe(16384)})
 it('mixes stereo without clipping and rejects mismatched channels or overlong recordings',()=>{const bytes=monoWave([new Float32Array([1,-1]),new Float32Array([-1,1])],24000);expect(new DataView(bytes.buffer).getInt16(44,true)).toBe(0);expect(()=>monoWave([new Float32Array(1),new Float32Array(2)],24000)).toThrow();expect(()=>monoWave([new Float32Array(8000*181)],8000)).toThrow('3 minutes')})
 it('validates clone and conversion limits before any upload',()=>{expect(()=>validateVoiceDuration(4,5,300)).toThrow();expect(()=>validateVoiceDuration(301,0,300)).toThrow();expect(()=>validateVoiceDuration(7,5,300)).not.toThrow();expect(waveDuration(new Uint8Array(12))).toBeNull()})
})
