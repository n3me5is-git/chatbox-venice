import { Alert, Button, Card, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { forkT as ft } from '@/i18n/fork'
import { pairingFromFrame } from '@/packages/collaboration/qr'

export function PairingScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null), [error, setError] = useState(''), [ready, setReady] = useState(false)
  useEffect(() => {
    let ended = false, stream: MediaStream | undefined, timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => { ended = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); if (video.current) video.current.srcObject = null }
    const dismiss = () => { stop(); onClose() }
    const hide = () => { if (document.hidden) dismiss() }
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', dismiss); window.addEventListener('chatbox:privacy-lock', dismiss)
    const scan = () => {
      if (ended) return
      const element = video.current
      try {
        if (element && element.readyState >= 2) {
          const code = pairingFromFrame(element, element.videoWidth, element.videoHeight, canvas)
          if (code) { stop(); onCode(code); return }
        }
        timer = setTimeout(scan, 250)
      } catch { stop(); setError('QR scanning is unavailable on this device') }
    }
    const canvas = document.createElement('canvas')
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Error('unavailable')
        const capture = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
        if (ended) { capture.getTracks().forEach(track => track.stop()); return }
        stream = capture
        if (!video.current) { stop(); return }
        video.current.srcObject = capture
        await video.current.play()
        if (!ended) { setReady(true); scan() }
      } catch (failure) {
        if (ended) return
        stop()
        setError(failure instanceof Error && /NotAllowed|PermissionDenied|SecurityError/.test(failure.name) ? 'Camera access was denied. Allow camera access in the device settings, or upload a QR image.' : 'The camera could not start. Close other camera apps, or upload a QR image.')
      }
    })()
    return () => { stop(); canvas.width = canvas.height = 1; document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', dismiss); window.removeEventListener('chatbox:privacy-lock', dismiss) }
  }, [onCode, onClose])
  return <Card withBorder><Stack gap="sm">
    <Text fw={600}>{ft('Scan pairing QR')}</Text>
    <Text size="sm">{ft('Point the camera at the owner’s QR code. Scanning stays on this device and does not join automatically.')}</Text>
    {error ? <Alert color="red">{ft(error)}</Alert> : <><video ref={video} autoPlay muted playsInline aria-label={ft('QR camera preview')} style={{ width: '100%', maxHeight: '40dvh', objectFit: 'contain', background: '#111', borderRadius: 8 }} />{!ready && <Text size="sm">{ft('Starting camera…')}</Text>}</>}
    <Button variant="default" onClick={onClose}>{ft('Close scanner')}</Button>
  </Stack></Card>
}
