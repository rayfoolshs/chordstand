import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * Camera QR reader.
 *
 * The stream is normally acquired by the caller from the tap that opened the
 * scanner, because iOS only grants camera access to a live user gesture. If no
 * stream is supplied it will ask for one itself, and a "Start camera" button
 * always allows a retry from a fresh tap.
 */
export function QrScanner({
  stream,
  onResult,
  onCancel,
}: {
  stream?: MediaStream | null
  onResult: (value: string) => void
  onCancel: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const resultRef = useRef(onResult)
  resultRef.current = onResult
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef(0)
  const aliveRef = useRef(true)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [starting, setStarting] = useState(false)

  const release = () => {
    cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const attach = async (media: MediaStream) => {
    const video = videoRef.current
    if (!video) {
      media.getTracks().forEach((track) => track.stop())
      setError('The camera preview could not open. Tap Start camera to try again.')
      return
    }
    streamRef.current = media
    video.srcObject = media
    await video.play()
    if (!aliveRef.current) return
    setReady(true)

    const canvas = document.createElement('canvas')
    const { default: jsQR } = await import('jsqr')

    const scan = () => {
      const element = videoRef.current
      if (!aliveRef.current || !element) return
      if (element.readyState >= 2 && element.videoWidth > 0) {
        const width = Math.min(720, element.videoWidth)
        const height = Math.round((width * element.videoHeight) / element.videoWidth)
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context) {
          context.drawImage(element, 0, 0, width, height)
          const image = context.getImageData(0, 0, width, height)
          const found = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })
          if (found?.data) {
            aliveRef.current = false
            release()
            resultRef.current(found.data)
            return
          }
        }
      }
      frameRef.current = requestAnimationFrame(scan)
    }

    scan()
  }

  const requestCamera = async () => {
    setError('')
    setStarting(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is unavailable here. Paste the pairing code instead.')
        return
      }
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (!aliveRef.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      await attach(media)
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera access was blocked. Allow the camera for this site (Settings → Safari → Camera), or paste the code instead.'
          : 'Could not open the camera. Tap Start camera, or paste the code instead.',
      )
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    aliveRef.current = true
    if (stream) {
      setStarting(true)
      attach(stream)
        .catch(() => setError('Could not start the camera preview. Tap Start camera, or paste the code instead.'))
        .finally(() => setStarting(false))
    } else {
      void requestCamera()
    }
    return () => {
      aliveRef.current = false
      release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="scanner">
      <div className="scanner-view">
        <video ref={videoRef} className="scanner-video" playsInline muted autoPlay />
        <div className="scanner-frame" aria-hidden="true" />
        {!ready && !error ? <p className="scanner-hint">Starting camera…</p> : null}
      </div>
      {error ? (
        <>
          <p className="sync-error">{error}</p>
          <button className="primary-button" onClick={() => void requestCamera()} disabled={starting}>
            <Icon name="camera" size={18} />
            {starting ? 'Starting…' : 'Start camera'}
          </button>
        </>
      ) : (
        <p className="scanner-hint">Point at the QR code on the other device.</p>
      )}
      <button className="ghost-button" onClick={onCancel}>
        <Icon name="close" size={18} />
        Cancel scan
      </button>
    </div>
  )
}
