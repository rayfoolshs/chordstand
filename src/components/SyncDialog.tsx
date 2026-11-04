import { useEffect, useRef, useState } from 'react'
import { useSync } from '../sync/useSync'
import { syncManager } from '../sync/manager'
import { summariseSignal } from '../sync/protocol'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { QrScanner } from './QrScanner'

export function SyncDialog() {
  const open = useSync((state) => state.open)
  const mode = useSync((state) => state.mode)
  const status = useSync((state) => state.status)
  const code = useSync((state) => state.code)
  const error = useSync((state) => state.error)
  const setOpen = useSync((state) => state.setOpen)

  const songs = useStore((state) => state.songs.length)
  const setlists = useStore((state) => state.setlists.length)

  const [paste, setPaste] = useState('')
  const [scanTarget, setScanTarget] = useState<'offer' | 'answer' | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setPaste('')
      setScanTarget(null)
      setCopied(false)
    }
  }, [open])

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const handleScan = (value: string) => {
    const target = scanTarget
    setScanTarget(null)
    setPaste('')
    if (target === 'offer') void syncManager.joinWithOffer(value)
    else void syncManager.acceptAnswer(value)
  }

  return (
    <Modal open={open} title="Mirror devices" onClose={() => setOpen(false)} wide>
      {scanTarget ? (
        <QrScanner onResult={handleScan} onCancel={() => setScanTarget(null)} />
      ) : (
        <div className="sync-dialog">
          {status === 'connected' ? (
            <ConnectedPanel songs={songs} setlists={setlists} />
          ) : mode === 'idle' ? (
            <>
              <p className="muted">
                Open Chordstand on the other iPad and connect the two. Songs, set lists and the current screen
                mirror live over your local network — no server, no account.
              </p>
              <div className="sync-choice">
                <button className="sync-option" onClick={() => void syncManager.startHost()}>
                  <span className="sync-option-icon">
                    <Icon name="link" size={22} />
                  </span>
                  <strong>Host this session</strong>
                  <em>Show a QR code for the other device to scan.</em>
                </button>
                <button className="sync-option" onClick={() => syncManager.beginJoin()}>
                  <span className="sync-option-icon">
                    <Icon name="camera" size={22} />
                  </span>
                  <strong>Join a session</strong>
                  <em>Scan the QR code shown on the other device.</em>
                </button>
              </div>
              {status === 'failed' && error ? <p className="sync-error">{error}</p> : null}
              <p className="fine-print">
                Both devices must be on the same Wi-Fi. The connection is direct and encrypted.
              </p>
            </>
          ) : (
            <>
              {error ? <p className="sync-error">{error}</p> : null}

              {mode === 'host' ? (
                <HostPanel
                  status={status}
                  code={code}
                  copied={copied}
                  paste={paste}
                  onPaste={setPaste}
                  onCopy={() => void copy(code)}
                  onScan={() => setScanTarget('answer')}
                  onAnswer={(value) => void syncManager.acceptAnswer(value)}
                  onRetry={() => void syncManager.startHost()}
                />
              ) : (
                <JoinPanel
                  status={status}
                  code={code}
                  copied={copied}
                  paste={paste}
                  onPaste={setPaste}
                  onCopy={() => void copy(code)}
                  onScan={() => setScanTarget('offer')}
                  onOffer={(value) => void syncManager.joinWithOffer(value)}
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
  paste,
  onPaste,
  onCopy,
  onScan,
  onAnswer,
  onRetry,
}: {
  status: string
  code: string
  copied: boolean
  paste: string
  onPaste: (value: string) => void
  onCopy: () => void
  onScan: () => void
  onAnswer: (value: string) => void
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

  if (status === 'preparing' || !code) {
    return <p className="sync-wait">Creating a secure pairing code…</p>
  }

  return (
    <div className="stack">
      <div className="sync-step">
        <h3>1. Scan this on the other device</h3>
        <QrCode value={code} />
        <p className="muted small">
          On the other iPad choose <strong>Join a session</strong> and point its camera here.
        </p>
        <div className="sync-actions">
          <button className="ghost-button" onClick={onCopy}>
            <Icon name={copied ? 'check' : 'copy'} size={17} />
            {copied ? 'Copied' : 'Copy code'}
          </button>
          <span className="fine-print">{summariseSignal(code)}</span>
        </div>
      </div>

      <div className="sync-step">
        <h3>2. Scan their answer</h3>
        {status === 'connecting' ? (
          <p className="sync-wait">Connecting…</p>
        ) : (
          <>
            <p className="muted small">After they scan, their screen shows a second QR code. Scan it here.</p>
            <button className="primary-button" onClick={onScan}>
              <Icon name="camera" size={18} />
              Scan answer
            </button>
          </>
        )}

        <details className="sync-fallback">
          <summary>Paste the answer code instead</summary>
          <textarea
            rows={3}
            value={paste}
            onChange={(event) => onPaste(event.target.value)}
            placeholder="CS1.…"
            spellCheck={false}
          />
          <button className="ghost-button" disabled={!paste.trim()} onClick={() => onAnswer(paste.trim())}>
            Connect
          </button>
        </details>
      </div>
    </div>
  )
}

function JoinPanel({
  status,
  code,
  copied,
  paste,
  onPaste,
  onCopy,
  onScan,
  onOffer,
  onRetry,
}: {
  status: string
  code: string
  copied: boolean
  paste: string
  onPaste: (value: string) => void
  onCopy: () => void
  onScan: () => void
  onOffer: (value: string) => void
  onRetry: () => void
}) {
  if (status === 'failed') {
    return (
      <div className="stack">
        <p className="sync-error">That pairing code did not work.</p>
        <button className="primary-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  if (status === 'preparing') {
    return <p className="sync-wait">Reading the host code…</p>
  }

  if (!code) {
    return (
      <div className="stack">
        <div className="sync-step">
          <h3>Scan the host code</h3>
          <p className="muted small">Point this camera at the QR code on the other device.</p>
          <button className="primary-button" onClick={onScan}>
            <Icon name="camera" size={18} />
            Scan host code
          </button>
        </div>

        <details className="sync-fallback">
          <summary>Paste the host code instead</summary>
          <textarea
            rows={3}
            value={paste}
            onChange={(event) => onPaste(event.target.value)}
            placeholder="CS1.…"
            spellCheck={false}
          />
          <button className="ghost-button" disabled={!paste.trim()} onClick={() => onOffer(paste.trim())}>
            Continue
          </button>
        </details>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="sync-step">
        <h3>Show this to the host</h3>
        <QrCode value={code} />
        <p className="muted small">
          Have the host scan this answer code. The session connects as soon as they do.
        </p>
        <div className="sync-actions">
          <button className="ghost-button" onClick={onCopy}>
            <Icon name={copied ? 'check' : 'copy'} size={17} />
            {copied ? 'Copied' : 'Copy code'}
          </button>
          <span className="fine-print">{summariseSignal(code)}</span>
        </div>
      </div>
      <p className="sync-wait">Waiting for the host to scan…</p>
    </div>
  )
}

function ConnectedPanel({ songs, setlists }: { songs: number; setlists: number }) {
  return (
    <div className="sync-connected">
      <span className="live-dot large" aria-hidden="true" />
      <h3>Devices are mirrored</h3>
      <p className="muted">
        {songs} {songs === 1 ? 'song' : 'songs'} and {setlists} {setlists === 1 ? 'set' : 'sets'} stay in sync.
        Picking a song, editing a chart or changing a set appears on both devices.
      </p>
      <p className="fine-print">
        Keep both apps open. Mirroring continues while this dialog is closed; the link icon in the header turns
        green.
      </p>
      <button className="danger-button" onClick={() => syncManager.disconnect()}>
        Stop mirroring
      </button>
    </div>
  )
}

function QrCode({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void import('qrcode')
      .then(({ toCanvas }) => {
        if (cancelled || !canvasRef.current) return
        return toCanvas(canvasRef.current, value, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: 'L',
          color: { dark: '#0b0d10', light: '#ffffff' },
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [value])

  return (
    <div className="qr-wrap">
      <div className="qr-box">
        {failed ? (
          <p className="muted small">QR code unavailable. Use the text code below.</p>
        ) : (
          <canvas ref={canvasRef} aria-label="Pairing QR code" />
        )}
      </div>
      <details className="sync-fallback">
        <summary>Show text code</summary>
        <textarea className="pair-code" readOnly rows={3} value={value} onFocus={(event) => event.currentTarget.select()} />
      </details>
    </div>
  )
}
