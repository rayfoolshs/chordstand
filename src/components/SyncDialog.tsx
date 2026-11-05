import { useEffect, useRef, useState } from 'react'
import { useSync } from '../sync/useSync'
import { syncManager } from '../sync/manager'
import { readLastSession, type LastSession } from '../sync/remember'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { QrScanner } from './QrScanner'

/** A shared/scanned code may be "1234" or a link ending in #join=1234. */
function extractCode(value: string): string {
  const digits = value.match(/\d{4}/)
  return digits ? digits[0] : ''
}

export function SyncDialog() {
  const open = useSync((state) => state.open)
  const mode = useSync((state) => state.mode)
  const status = useSync((state) => state.status)
  const code = useSync((state) => state.code)
  const error = useSync((state) => state.error)
  const notice = useSync((state) => state.notice)
  const peerCount = useSync((state) => state.peerCount)
  const setOpen = useSync((state) => state.setOpen)

  const songs = useStore((state) => state.songs.length)
  const setlists = useStore((state) => state.setlists.length)

  const [entered, setEntered] = useState('')
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanStream, setScanStream] = useState<MediaStream | null>(null)
  const [last, setLast] = useState<LastSession | null>(null)

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    if (open) setLast(readLastSession())
  }, [open])

  useEffect(() => {
    if (!open) {
      scanStream?.getTracks().forEach((track) => track.stop())
      setScanStream(null)
      setScanning(false)
      setEntered('')
      setCopied(false)
      setShared(false)
      useSync.getState().patch({ notice: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A shared link arrives as #join=1234: open the dialog and join with it.
  useEffect(() => {
    const match = window.location.hash.match(/join=(\d{4})/)
    if (!match) return
    history.replaceState(null, '', window.location.pathname + window.location.search)
    useSync.getState().setOpen(true)
    setEntered(match[1])
    void syncManager.joinWithCode(match[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const link = code ? `${window.location.origin}${window.location.pathname}#join=${code}` : ''

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const share = async () => {
    if (!code) return
    try {
      if (canShare) {
        await navigator.share({
          title: 'Chordstand session',
          text: `Join my Chordstand session with code ${code}`,
          url: link,
        })
        setShared(true)
        window.setTimeout(() => setShared(false), 1600)
        return
      }
      await copy(code)
    } catch {
      // Share sheet dismissed.
    }
  }

  // Ask for the camera from the tap (iOS only grants it inside a gesture).
  const beginScan = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      useSync.getState().patch({ notice: 'Camera access is unavailable here. Type the code instead.' })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      setScanStream(stream)
      setScanning(true)
    } catch {
      useSync.getState().patch({ notice: 'Could not open the camera. Allow access, or type the code.' })
    }
  }

  const stopScan = () => {
    scanStream?.getTracks().forEach((track) => track.stop())
    setScanStream(null)
    setScanning(false)
  }

  const handleScan = (value: string) => {
    stopScan()
    const found = extractCode(value)
    if (!found) {
      useSync.getState().patch({ notice: 'That was not a Chordstand code. Try again.' })
      return
    }
    setEntered(found)
    void syncManager.joinWithCode(found)
  }

  const submitCode = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    setEntered(digits)
    if (digits.length === 4) void syncManager.joinWithCode(digits)
  }

  return (
    <Modal open={open} title="Mirror devices" onClose={() => setOpen(false)} wide>
      {scanning ? (
        <QrScanner stream={scanStream} onResult={handleScan} onCancel={stopScan} />
      ) : (
        <div className="sync-dialog">
          {status === 'connected' ? (
            <ConnectedPanel
              songs={songs}
              setlists={setlists}
              peerCount={peerCount}
              hostCode={mode === 'host' ? code : ''}
              copied={copied}
              shared={shared}
              canShare={canShare}
              onCopy={() => void copy(code)}
              onShare={() => void share()}
            />
          ) : mode === 'idle' ? (
            <>
              <p className="muted">
                One iPad hosts and shows a 4-digit code. The others enter it and the screens mirror live —
                songs, set lists, scrolling and key changes.
              </p>
              {last ? (
                <button className="sync-reconnect" onClick={() => void syncManager.reconnect()}>
                  <span className="sync-option-icon">
                    <Icon name="refresh" size={22} />
                  </span>
                  <span className="sync-reconnect-text">
                    <strong>Reconnect to last device</strong>
                    <em>
                      {last.role === 'host' ? 'Host again' : 'Join again'}
                      {last.code ? ` with code ${last.code}` : ''}.
                    </em>
                  </span>
                </button>
              ) : null}
              <div className="sync-choice">
                <button className="sync-option" onClick={() => void syncManager.startHost()}>
                  <span className="sync-option-icon">
                    <Icon name="link" size={22} />
                  </span>
                  <strong>Host this session</strong>
                  <em>Show a 4-digit code for the other iPads.</em>
                </button>
                <button className="sync-option" onClick={() => syncManager.beginJoin()}>
                  <span className="sync-option-icon">
                    <Icon name="camera" size={22} />
                  </span>
                  <strong>Join a session</strong>
                  <em>Enter the host's code, or scan it.</em>
                </button>
              </div>
              {status === 'failed' && error ? <p className="sync-error">{error}</p> : null}
              <p className="fine-print">
                The connection is direct between the iPads and encrypted. Pairing needs the internet for a
                moment; the mirroring itself does not.
              </p>
            </>
          ) : (
            <>
              {error ? <p className="sync-error">{error}</p> : null}
              {notice ? <p className="sync-notice">{notice}</p> : null}

              {mode === 'host' ? (
                <HostPanel
                  status={status}
                  code={code}
                  copied={copied}
                  shared={shared}
                  canShare={canShare}
                  onCopy={() => void copy(code)}
                  onShare={() => void share()}
                  onRetry={() => void syncManager.startHost()}
                />
              ) : (
                <JoinPanel
                  status={status}
                  entered={entered}
                  onChange={submitCode}
                  onScan={() => void beginScan()}
                  onJoin={() => void syncManager.joinWithCode(entered)}
                  onRetry={() => syncManager.beginJoin()}
                />
              )}

              <button className="text-button" onClick={() => syncManager.disconnect()}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function HostPanel({
  status,
  code,
  copied,
  shared,
  canShare,
  onCopy,
  onShare,
  onRetry,
}: {
  status: string
  code: string
  copied: boolean
  shared: boolean
  canShare: boolean
  onCopy: () => void
  onShare: () => void
  onRetry: () => void
}) {
  if (status === 'failed') {
    return (
      <div className="stack">
        <p className="sync-error">The session could not start.</p>
        <button className="primary-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  if (!code) {
    return <p className="sync-wait">Getting a pairing code…</p>
  }

  return (
    <div className="stack">
      <div className="sync-step">
        <h3>On the other iPad, enter this code</h3>
        <BigCode code={code} />
        <div className="sync-actions">
          <button className="ghost-button" onClick={onCopy}>
            <Icon name={copied ? 'check' : 'copy'} size={17} />
            {copied ? 'Copied' : 'Copy code'}
          </button>
          {canShare ? (
            <button className="ghost-button" onClick={onShare}>
              <Icon name={shared ? 'check' : 'upload'} size={17} />
              {shared ? 'Shared' : 'Share'}
            </button>
          ) : null}
        </div>
        <p className="fine-print">
          Open Chordstand there → <strong>Join a session</strong> → type the code, or scan the QR.
        </p>
        <Qr value={code} />
      </div>
      <p className="sync-wait">Waiting for a device to join…</p>
    </div>
  )
}

function JoinPanel({
  status,
  entered,
  onChange,
  onScan,
  onJoin,
  onRetry,
}: {
  status: string
  entered: string
  onChange: (value: string) => void
  onScan: () => void
  onJoin: () => void
  onRetry: () => void
}) {
  if (status === 'failed') {
    return (
      <div className="stack">
        <p className="sync-error">That code did not work.</p>
        <button className="primary-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  if (status === 'connecting') {
    return (
      <div className="stack">
        <p className="sync-wait">Connecting…</p>
        <p className="fine-print">Keep both apps open until the link icon turns green.</p>
        <button className="ghost-button" onClick={onRetry}>
          Start over
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="sync-step">
        <h3>Enter the host's code</h3>
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={4}
          placeholder="0000"
          value={entered}
          onChange={(event) => onChange(event.target.value)}
          aria-label="4-digit pairing code"
        />
        <div className="sync-actions">
          <button className="primary-button" disabled={entered.length !== 4} onClick={onJoin}>
            Connect
          </button>
          <button className="ghost-button" onClick={onScan}>
            <Icon name="camera" size={17} />
            Scan QR
          </button>
        </div>
        <p className="fine-print">The code is shown on the host iPad.</p>
      </div>
    </div>
  )
}

function BigCode({ code }: { code: string }) {
  return (
    <div className="big-code" aria-label={`Pairing code ${code}`}>
      {code.split('').map((digit, index) => (
        <span key={index}>{digit}</span>
      ))}
    </div>
  )
}

function Qr({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const link = `${window.location.origin}${window.location.pathname}#join=${value}`

  useEffect(() => {
    let cancelled = false
    void import('qrcode')
      .then(({ toCanvas }) => {
        if (cancelled || !canvasRef.current) return
        return toCanvas(canvasRef.current, link, {
          width: 240,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#0b0d10', light: '#ffffff' },
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [link])

  if (failed) return null
  return (
    <div className="qr-box">
      <canvas ref={canvasRef} aria-label="Pairing QR code" />
    </div>
  )
}

function ConnectedPanel({
  songs,
  setlists,
  peerCount,
  hostCode,
  copied,
  shared,
  canShare,
  onCopy,
  onShare,
}: {
  songs: number
  setlists: number
  peerCount: number
  hostCode: string
  copied: boolean
  shared: boolean
  canShare: boolean
  onCopy: () => void
  onShare: () => void
}) {
  const total = hostCode ? peerCount + 1 : 2
  const heading = total > 2 ? `${total} devices are mirrored` : 'Devices are mirrored'
  return (
    <div className="sync-connected">
      <span className="live-dot large" aria-hidden="true" />
      <h3>{heading}</h3>
      <p className="muted">
        {songs} {songs === 1 ? 'song' : 'songs'} and {setlists} {setlists === 1 ? 'set' : 'sets'} stay in sync.
        Picking a song, scrolling or changing the key appears on every device.
      </p>
      {hostCode ? (
        <div className="sync-step">
          <h3>Another iPad can still join with this code</h3>
          <BigCode code={hostCode} />
          <div className="sync-actions">
            <button className="ghost-button" onClick={onCopy}>
              <Icon name={copied ? 'check' : 'copy'} size={17} />
              {copied ? 'Copied' : 'Copy code'}
            </button>
            {canShare ? (
              <button className="ghost-button" onClick={onShare}>
                <Icon name={shared ? 'check' : 'upload'} size={17} />
                {shared ? 'Shared' : 'Share'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="fine-print">
        Keep every app open. Mirroring continues while this dialog is closed; the link icon in the header turns
        green.
      </p>
      <button className="danger-button" onClick={() => syncManager.disconnect()}>
        Stop mirroring
      </button>
    </div>
  )
}
