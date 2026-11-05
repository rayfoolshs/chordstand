import { useEffect, useState } from 'react'
import { useSync } from '../sync/useSync'
import { syncManager } from '../sync/manager'
import { summariseSignal } from '../sync/protocol'
import { readLastSession, type LastSession } from '../sync/remember'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function SyncDialog() {
  const open = useSync((state) => state.open)
  const mode = useSync((state) => state.mode)
  const status = useSync((state) => state.status)
  const code = useSync((state) => state.code)
  const error = useSync((state) => state.error)
  const notice = useSync((state) => state.notice)
  const peerCount = useSync((state) => state.peerCount)
  const adding = useSync((state) => state.adding)
  const setOpen = useSync((state) => state.setOpen)

  const songs = useStore((state) => state.songs.length)
  const setlists = useStore((state) => state.setlists.length)

  const [paste, setPaste] = useState('')
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [last, setLast] = useState<LastSession | null>(null)

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    if (open) setLast(readLastSession())
  }, [open])

  useEffect(() => {
    if (!open) {
      setPaste('')
      setCopied(false)
      setShared(false)
      useSync.getState().patch({ notice: '' })
    }
  }, [open])

  // A shared pairing link arrives as #pair=<offer>. Open the dialog and join
  // straight away, so the host only has to send one link.
  useEffect(() => {
    const match = window.location.hash.match(/pair=([^&]+)/)
    if (!match) return
    const value = decodeURIComponent(match[1])
    history.replaceState(null, '', window.location.pathname + window.location.search)
    useSync.getState().setOpen(true)
    void syncManager.joinWithOffer(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  // The offer is shared as a link so the receiving iPad opens it and joins
  // automatically; the answer is shared as text for the host to paste. Text
  // alone (previous approach) cannot trigger the app, so the code had to be
  // pasted by hand.
  const share = async (value: string, kind: 'offer' | 'answer') => {
    const link = `${window.location.origin}${window.location.pathname}#pair=${encodeURIComponent(value)}`
    try {
      if (canShare) {
        if (kind === 'offer') {
          await navigator.share({
            title: 'Chordstand session',
            text: 'Tap to join my Chordstand session.',
            url: link,
          })
        } else {
          await navigator.share({ title: 'Chordstand answer code', text: value })
        }
        setShared(true)
        window.setTimeout(() => setShared(false), 1600)
        return
      }
      await navigator.clipboard.writeText(kind === 'offer' ? link : value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // The share sheet was dismissed; nothing to do.
    }
  }

  // Read a code straight from the clipboard and use it, with no typing.
  const pasteFromClipboard = async (run: (value: string) => void) => {
    let text = ''
    try {
      text = (await navigator.clipboard.readText()).trim()
    } catch {
      text = ''
    }
    if (!text) {
      useSync.getState().patch({
        notice: 'Could not read the clipboard. Paste the code into the box instead.',
      })
      return
    }
    useSync.getState().patch({ notice: '' })
    setPaste(text)
    run(text)
  }

  return (
    <Modal open={open} title="Mirror devices" onClose={() => setOpen(false)} wide>
      <div className="sync-dialog">
        {status === 'connected' ? (
          <ConnectedPanel
            songs={songs}
            setlists={setlists}
            peerCount={peerCount}
            canAdd={mode === 'host'}
            onAdd={() => void syncManager.addDevice()}
          />
        ) : mode === 'idle' ? (
          <>
            <p className="muted">
              Open Chordstand on the other iPad and connect the two. Songs, set lists and the current screen
              mirror live over your local network — no server, no account.
            </p>
            {last ? (
              <button className="sync-reconnect" onClick={() => void syncManager.reconnect()}>
                <span className="sync-option-icon">
                  <Icon name="refresh" size={22} />
                </span>
                <span className="sync-reconnect-text">
                  <strong>Reconnect to last device</strong>
                  <em>Resume as {last.role === 'host' ? 'the host' : 'the joiner'} without choosing again.</em>
                </span>
              </button>
            ) : null}
            <div className="sync-choice">
              <button className="sync-option" onClick={() => void syncManager.startHost()}>
                <span className="sync-option-icon">
                  <Icon name="link" size={22} />
                </span>
                <strong>Host this session</strong>
                <em>Share a code or link; the other iPad pastes it to join.</em>
              </button>
              <button className="sync-option" onClick={() => syncManager.beginJoin()}>
                <span className="sync-option-icon">
                  <Icon name="copy" size={22} />
                </span>
                <strong>Join a session</strong>
                <em>Paste the code or link the host shared.</em>
              </button>
            </div>
            {status === 'failed' && error ? <p className="sync-error">{error}</p> : null}
            <p className="fine-print">Both devices must be on the same Wi-Fi. The connection is direct and encrypted.</p>
            <p className="fine-print">
              Different Apple IDs? Send the code with AirDrop or Messages. On the same Apple ID, Universal
              Clipboard carries it across automatically.
            </p>
          </>
        ) : (
          <>
            {error ? <p className="sync-error">{error}</p> : null}
            {notice ? <p className="sync-notice">{notice}</p> : null}
            {mode === 'host' && adding ? (
              <p className="fine-print">
                {peerCount} {peerCount === 1 ? 'device is' : 'devices are'} already mirrored. Pair the new one
                the same way, and it joins the session.
              </p>
            ) : null}

            {mode === 'host' ? (
              <HostPanel
                status={status}
                code={code}
                copied={copied}
                shared={shared}
                canShare={canShare}
                paste={paste}
                onPaste={setPaste}
                onCopy={() => void copy(code)}
                onShare={() => void share(code, 'offer')}
                onAnswer={(value) => void syncManager.acceptAnswer(value)}
                onPasteConnect={() => void pasteFromClipboard((value) => syncManager.acceptAnswer(value))}
                onRetry={() => void syncManager.startHost()}
              />
            ) : (
              <JoinPanel
                status={status}
                code={code}
                copied={copied}
                shared={shared}
                canShare={canShare}
                paste={paste}
                onPaste={setPaste}
                onCopy={() => void copy(code)}
                onShare={() => void share(code, 'answer')}
                onOffer={(value) => void syncManager.joinWithOffer(value)}
                onPasteConnect={() => void pasteFromClipboard((value) => syncManager.joinWithOffer(value))}
                onRetry={() => syncManager.beginJoin()}
              />
            )}

            <button
              className="text-button"
              onClick={() => (adding ? syncManager.cancelPending() : syncManager.disconnect())}
            >
              {adding ? 'Cancel adding' : 'Cancel'}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

function HostPanel({
  status,
  code,
  copied,
  shared,
  canShare,
  paste,
  onPaste,
  onCopy,
  onShare,
  onAnswer,
  onPasteConnect,
  onRetry,
}: {
  status: string
  code: string
  copied: boolean
  shared: boolean
  canShare: boolean
  paste: string
  onPaste: (value: string) => void
  onCopy: () => void
  onShare: () => void
  onAnswer: (value: string) => void
  onPasteConnect: () => void
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
        <h3>1. Send this code to the other iPad</h3>
        <PairCode value={code} copied={copied} shared={shared} canShare={canShare} onCopy={onCopy} onShare={onShare} />
        <p className="fine-print">
          Tap <strong>Share</strong> to send a link by AirDrop or Messages. Opening that link on the other iPad
          joins automatically — no pasting. Or tap <strong>Copy code</strong> and paste it there by hand.
        </p>
      </div>

      <div className="sync-step">
        <h3>2. Paste their answer</h3>
        {status === 'connecting' ? (
          <>
            <p className="sync-wait">Connecting…</p>
            <p className="fine-print">
              Both iPads must be on the same Wi-Fi with Local Network access allowed. If this hangs, tap
              Cancel and start again.
            </p>
          </>
        ) : (
          <>
            <p className="muted small">They send their answer back the same way. Paste it here to connect.</p>
            <textarea
              rows={3}
              value={paste}
              onChange={(event) => onPaste(event.target.value)}
              placeholder="CS1.…"
              spellCheck={false}
            />
            <div className="sync-actions">
              <button className="primary-button" onClick={onPasteConnect}>
                <Icon name="copy" size={18} />
                Paste answer &amp; connect
              </button>
              <button className="ghost-button" disabled={!paste.trim()} onClick={() => onAnswer(paste.trim())}>
                Connect
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function JoinPanel({
  status,
  code,
  copied,
  shared,
  canShare,
  paste,
  onPaste,
  onCopy,
  onShare,
  onOffer,
  onPasteConnect,
  onRetry,
}: {
  status: string
  code: string
  copied: boolean
  shared: boolean
  canShare: boolean
  paste: string
  onPaste: (value: string) => void
  onCopy: () => void
  onShare: () => void
  onOffer: (value: string) => void
  onPasteConnect: () => void
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
          <h3>Paste the host code</h3>
          <p className="muted small">
            Ask the host to send the code with AirDrop or Messages, then paste it below. A shared link also
            joins automatically.
          </p>
          <textarea
            rows={3}
            value={paste}
            onChange={(event) => onPaste(event.target.value)}
            placeholder="CS1.…"
            spellCheck={false}
          />
          <div className="sync-actions">
            <button className="primary-button" onClick={onPasteConnect}>
              <Icon name="copy" size={18} />
              Paste &amp; continue
            </button>
            <button className="ghost-button" disabled={!paste.trim()} onClick={() => onOffer(paste.trim())}>
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="sync-step">
        <h3>Share this answer with the host</h3>
        <PairCode value={code} copied={copied} shared={shared} canShare={canShare} onCopy={onCopy} onShare={onShare} />
        <p className="fine-print">
          Send this back to the host with AirDrop or Messages, then they paste it. On the same Apple ID it
          reaches them automatically.
        </p>
      </div>
      <p className="sync-wait">Waiting for the host to connect…</p>
    </div>
  )
}

function PairCode({
  value,
  copied,
  shared,
  canShare,
  onCopy,
  onShare,
}: {
  value: string
  copied: boolean
  shared: boolean
  canShare: boolean
  onCopy: () => void
  onShare: () => void
}) {
  return (
    <div className="pair-code-wrap">
      <textarea
        className="pair-code"
        readOnly
        rows={3}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
      />
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
        <span className="fine-print">{summariseSignal(value)}</span>
      </div>
    </div>
  )
}

function ConnectedPanel({
  songs,
  setlists,
  peerCount,
  canAdd,
  onAdd,
}: {
  songs: number
  setlists: number
  peerCount: number
  canAdd: boolean
  onAdd: () => void
}) {
  const total = canAdd ? peerCount + 1 : 2
  const heading = canAdd && total > 2 ? `${total} devices are mirrored` : 'Devices are mirrored'
  const target = canAdd && total > 2 ? 'every device' : 'the other device'
  return (
    <div className="sync-connected">
      <span className="live-dot large" aria-hidden="true" />
      <h3>{heading}</h3>
      <p className="muted">
        {songs} {songs === 1 ? 'song' : 'songs'} and {setlists} {setlists === 1 ? 'set' : 'sets'} stay in sync.
        Picking a song, editing a chart or changing a set appears on {target}.
      </p>
      <p className="fine-print">
        Keep every app open. Mirroring continues while this dialog is closed; the link icon in the header turns
        green.
      </p>
      {canAdd ? (
        <button className="ghost-button" onClick={onAdd}>
          <Icon name="plus" size={17} />
          Add another device
        </button>
      ) : null}
      <button className="danger-button" onClick={() => syncManager.disconnect()}>
        Stop mirroring
      </button>
    </div>
  )
}
