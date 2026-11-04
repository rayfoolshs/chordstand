import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export function QrScanner({
  onResult,
  onCancel,
}: {
  onResult: (value: string) => void
  onCancel: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const resultRef = useRef(onResult)
  resultRef.current = onResult
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let cancelled = false
    const canvas = document.createElement('canvas')

    const stop = () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is unavailable here. Paste the pairing code instead.')
        return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setReady(true)

        const { default: jsQR } = await import('jsqr')

        const scan = () => {
          if (cancelled || !videoRef.current) return
          const element = videoRef.current
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
                stop()
                resultRef.current(found.data)
                return
              }
            }
          }
          frame = requestAnimationFrame(scan)
        }

        scan()
      } catch {
        setError('Could not open the camera. Allow camera access, or paste the code instead.')
      }
    }

    void start()
    return stop
  }, [])

  return (
    <div className="scanner">
      <div className="scanner-view">
        <video ref={videoRef} className="scanner-video" playsInline muted autoPlay />
        <div className="scanner-frame" aria-hidden="true" />
        {!ready && !error ? <p className="scanner-hint">Starting camera…</p> : null}
      </div>
      {error ? <p className="sync-error">{error}</p> : <p className="scanner-hint">Point at the QR code on the other device.</p>}
      <button className="ghost-button" onClick={onCancel}>
        <Icon name="close" size={18} />
        Cancel scan
      </button>
    </div>
  )
}
