import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { recordingAsWave } from '@/packages/voice-file'
export function VeniceRecorder({ onRecorded,compatibleFormats }: { onRecorded: (file: File) => void;compatibleFormats?:string[] }) {
  useTranslation()
  const [recording, setRecording] = useState(false); const [error, setError] = useState(''); const [elapsed, setElapsed] = useState(0)
  const [preparing,setPreparing]=useState(false);const preparation=useRef<AbortController|null>(null)
  const recorder = useRef<MediaRecorder | null>(null); const tracks = useRef<MediaStream | null>(null); const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false;preparation.current?.abort(); if (recorder.current?.state === 'recording') recorder.current.stop(); tracks.current?.getTracks().forEach(track => track.stop()) } }, [])
  useEffect(() => { if (!recording) return; const timer = setInterval(() => setElapsed(seconds => { if (seconds >= 179) recorder.current?.stop(); return seconds + 1 }), 1000); return () => clearInterval(timer) }, [recording])
  const start = async () => {
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error(ft("Recording is unavailable on this device. You can upload an audio file."))
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!alive.current) { stream.getTracks().forEach(track => track.stop()); return }
      tracks.current = stream; const candidates=compatibleFormats?['audio/mp4','audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/webm']:['audio/webm;codecs=opus','audio/mp4','audio/webm'];const mime=candidates.find(type=>(!compatibleFormats||(type.includes('mp4')?(compatibleFormats.includes('mp4')||compatibleFormats.includes('m4a')):compatibleFormats.includes(type.includes('ogg')?'ogg':'webm')))&&MediaRecorder.isTypeSupported(type))||['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
      const current = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); recorder.current = current
      const chunks: Blob[] = []; let bytes = 0
      current.ondataavailable = event => { bytes += event.data.size; if (bytes > 25 * 1024 * 1024) { setError(ft("Recording too large: 25 MB limit.")); current.stop(); return }; chunks.push(event.data) }
      current.onerror = () => { setError(ft("Recording was interrupted by the device.")); if (current.state === 'recording') current.stop(); stream.getTracks().forEach(track => track.stop()) }
      current.onstop = async () => { stream.getTracks().forEach(track => track.stop()); if (!alive.current) return;setRecording(false);if(bytes<=0||bytes>25*1024*1024)return;setPreparing(true);const controller=new AbortController();preparation.current=controller
        try{const extension=current.mimeType.includes('mp4')?(compatibleFormats?.includes('mp4')?'mp4':'m4a'):current.mimeType.includes('ogg')?'ogg':'webm';let file=new File(chunks,`Recording-${Date.now()}.${extension}`,{type:current.mimeType});if(compatibleFormats&&!compatibleFormats.includes(extension)){if(!compatibleFormats.includes('wav'))throw new Error(ft('This model cannot use recordings from this device. Upload a supported audio file.'));file=await recordingAsWave(file,controller.signal)}if(alive.current)onRecorded(file)}catch(error){if(alive.current)setError(error instanceof Error?error.message:ft('Unable to prepare the recording'))}finally{if(alive.current)setPreparing(false)} }
      current.start(1000); setElapsed(0); setRecording(true)
    } catch (e) { tracks.current?.getTracks().forEach(track => track.stop()); setRecording(false); setError(e instanceof Error && ['NotAllowedError','PermissionDeniedError'].includes(e.name) ? ft('Microphone access was denied. Check the app or browser microphone permission and the device microphone privacy switch, then try again.') : e instanceof Error ? e.message : ft("Microphone unavailable")) }
  }
  return <Stack gap="xs"><Group><Button loading={preparing} variant={recording ? 'filled' : 'default'} color={recording ? 'red' : undefined} onClick={() => recording ? recorder.current?.stop() : void start()}>{recording ? ft("Stop recording") : ft("Record from microphone")}</Button>{recording && <Text role="status">{elapsed}s / 180s</Text>}</Group><Text size="xs" c="dimmed">{ft('Record locally for up to 3 minutes. Nothing is uploaded until you confirm the selected action.')}</Text>{error && <Alert color="red">{ft(error)}</Alert>}</Stack>
}
