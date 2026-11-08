import vendor from './vendor/chic-transfer-vendor.js'
import { encodeInvitation, parseInvitation } from './crypto'

/** The same local jsQR decoder serves camera frames and uploaded images. */
export function pairingFromPixels(data: Uint8ClampedArray, width: number, height: number): string | undefined {
  const result = vendor.jsQR(data, width, height)
  if (!result) return undefined
  if (result.data.trim().replace(/^.*#/, '').startsWith('CB1.')) throw Error('This invitation uses an older sharing version. Update both apps and create a new invitation.')
  try { return encodeInvitation(parseInvitation(result.data)) } catch { return undefined }
}

export function pairingFromFrame(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement, max = 1400): string | undefined {
  if (!width || !height) return undefined
  const scale = Math.min(1, max / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw Error('QR scanning is unavailable on this device')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return pairingFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
}

export async function pairingFromImage(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw Error('Choose an image smaller than 20 MB')
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    const code = pairingFromFrame(bitmap, bitmap.width, bitmap.height, canvas, 1800) || pairingFromFrame(bitmap, bitmap.width, bitmap.height, canvas, 2600)
    canvas.width = canvas.height = 1
    if (!code) throw Error('No pairing QR code found in this image')
    return code
  } finally { bitmap.close() }
}
