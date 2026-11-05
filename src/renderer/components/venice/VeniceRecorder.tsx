import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
export function VeniceRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  useTranslation()
  const [recording, setRecording] = useState(false); const [error, setError] = useState(''); const [elapsed, setElapsed] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null); const tracks = useRef<MediaStream | null>(null); const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (recorder.current?.state === 'recording') recorder.current.stop(); tracks.current?.getTracks().forEach(track => track.stop()) } }, [])
  useEffect(() => { if (!recording) return; const timer = setInterval(() => setElapsed(seconds => { if (seconds >= 179) recorder.current?.stop(); return seconds + 1 }), 1000); return () => clearInterval(timer) }, [recording])
  const start = async () => {
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error(ft("Recording is unavailable on this device. You can upload an audio file."))
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!alive.current) { stream.getTracks().forEach(track => track.stop()); return }
      tracks.current = stream; const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
      const current = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); recorder.current = current
      const chunks: Blob[] = []; let bytes = 0
      current.ondataavailable = event => { bytes += event.data.size; if (bytes > 25 * 1024 * 1024) { setError(ft("Recording too large: 25 MB limit.")); current.stop(); return }; chunks.push(event.data) }
      current.onerror = () => { setError(ft("Recording was interrupted by the device.")); if (current.state === 'recording') current.stop(); stream.getTracks().forEach(track => track.stop()) }
      current.onstop = () => { stream.getTracks().forEach(track => track.stop()); if (!alive.current) return; setRecording(false); if (bytes > 0 && bytes <= 25 * 1024 * 1024) onRecorded(new File(chunks, `Recording-${Date.now()}.${current.mimeType.includes('mp4') ? 'm4a' : 'webm'}`, { type: current.mimeType })) }
      current.start(1000); setElapsed(0); setRecording(true)
    } catch (e) { tracks.current?.getTracks().forEach(track => track.stop()); setRecording(false); setError(e instanceof Error ? e.message : ft("Microphone unavailable")) }
  }
  return <Stack gap="xs"><Group><Button variant={recording ? 'filled' : 'default'} color={recording ? 'red' : undefined} onClick={() => recording ? recorder.current?.stop() : void start()}>{recording ? ft("Stop recording") : ft("Record from microphone")}</Button>{recording && <Text role="status">{elapsed}s / 180s</Text>}</Group><Text size="xs" c="dimmed">{ft("Record locally for up to 3 minutes. Audio is sent to Venice only when you select Transcribe.")}</Text>{error && <Alert color="red">{error}</Alert>}</Stack>
}
