import { useRef, useState } from 'react'
import type { ImportCandidate } from '../core/types'
import { candidateFromText, readImportFiles, songFromCandidate, type ImportIssue, type ImportResult } from '../core/import'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'

export function ImportView({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const songs = useStore((state) => state.songs)
  const addSongs = useStore((state) => state.addSongs)
  const restoreBackup = useStore((state) => state.restoreBackup)

  const [candidates, setCandidates] = useState<ImportCandidate[]>([])
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [backup, setBackup] = useState<ImportResult['backup']>()
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setBusy(true)
    try {
      const result = await readImportFiles(list, songs)
      setCandidates((current) => [...current, ...result.candidates])
      setIssues((current) => [...current, ...result.issues])
      if (result.backup) setBackup(result.backup)
    } finally {
      setBusy(false)
    }
  }

  const addPasted = () => {
    if (!paste.trim()) return
    const candidate = candidateFromText('Pasted chart.onsong', paste, songs)
    setCandidates((current) => [...current, candidate])
    setPaste('')
  }

  const selected = candidates.filter((candidate) => candidate.selected)
  const warningCount = candidates.reduce((total, candidate) => total + candidate.parsed.warnings.length, 0)

  const runImport = async () => {
    if (!selected.length) return
    setImporting(true)
    try {
      await addSongs(selected.map((candidate) => songFromCandidate(candidate)))
      onDone()
    } finally {
      setImporting(false)
    }
  }

  const runRestore = async () => {
    if (!backup) return
    setImporting(true)
    try {
      await restoreBackup(backup.songs, backup.setlists)
      onDone()
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="screen import-screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="brand">
          <div>
            <h1>Import</h1>
            <p>OnSong, ChordPro, plain text</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="primary-button" disabled={!selected.length || importing} onClick={() => void runImport()}>
            <Icon name="check" size={18} />
            {importing ? 'Saving…' : `Import ${selected.length || ''}`}
          </button>
        </div>
      </header>

      <div className="import-body">
        {backup && (
          <div className="restore-card">
            <div>
              <strong>Chordstand backup found</strong>
              <p className="muted small">
                {backup.songs.length} songs · {backup.setlists.length} set lists. Restoring merges it with this
                device instead of importing the same charts twice.
              </p>
            </div>
            <button className="primary-button" onClick={() => void runRestore()} disabled={importing}>
              <Icon name="download" size={18} />
              Restore backup
            </button>
          </div>
        )}

        <div
          className={`drop-zone ${dragging ? 'is-dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Drop chart files or open the file picker"
          onClick={(event) => {
            if (event.target instanceof HTMLElement && event.target.closest('button')) return
            inputRef.current?.click()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            void handleFiles(event.dataTransfer.files)
          }}
        >
          <div className="drop-icon">
            <Icon name="upload" size={28} />
          </div>
          <h2>Drop your charts here</h2>
          <p>
            A zip of <code>.onsong</code> files is best. Plain text, ChordPro and OnSong files work too. Nothing is
            saved until you review the preview.
          </p>
          <button className="ghost-button" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Reading…' : 'Choose files'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".onsong,.txt,.text,.chordpro,.chopro,.cho,.crd,.pro,.chord,.zip,.json,text/plain,application/zip,application/json"
            onChange={(event) => {
              if (event.target.files) void handleFiles(event.target.files)
              event.target.value = ''
            }}
            hidden
          />
          <p className="fine-print">PDF and image charts are not supported in this build.</p>
        </div>

        <div className="paste-card">
          <label className="field wide">
            <span>Or paste a chart</span>
            <textarea
              rows={5}
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder={'Title: …\nArtist: …\nKey: G\n\n[Verse]\nG        C\nLyrics here…'}
            />
          </label>
          <button className="ghost-button" onClick={addPasted} disabled={!paste.trim()}>
            <Icon name="plus" size={18} />
            Add pasted chart
          </button>
        </div>

        {(candidates.length > 0 || issues.length > 0) && (
          <div className="preview">
            <div className="preview-head">
              <div>
                <h2>
                  {candidates.length} {candidates.length === 1 ? 'chart' : 'charts'} found
                </h2>
                <p className="muted small">
                  {selected.length} selected
                  {warningCount ? ` · ${warningCount} notes` : ''}
                  {issues.length ? ` · ${issues.length} skipped` : ''}
                </p>
              </div>
              <div className="preview-actions">
                <button
                  className="ghost-button"
                  onClick={() =>
                    setCandidates((current) => current.map((candidate) => ({ ...candidate, selected: true })))
                  }
                >
                  Select all
                </button>
                <button
                  className="ghost-button"
                  onClick={() =>
                    setCandidates((current) => current.map((candidate) => ({ ...candidate, selected: false })))
                  }
                >
                  None
                </button>
              </div>
            </div>

            <div className="preview-list">
              {candidates.map((candidate, index) => (
                <div className={`preview-row ${candidate.selected ? '' : 'unselected'}`} key={`${candidate.fileName}-${index}`}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={candidate.selected}
                      onChange={(event) =>
                        setCandidates((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, selected: event.target.checked } : item,
                          ),
                        )
                      }
                    />
                    <span />
                  </label>
                  <div className="preview-main">
                    <strong>{candidate.parsed.title}</strong>
                    <em>
                      {candidate.parsed.artist || 'Unknown artist'}
                      {candidate.parsed.meta.key ? ` · ${candidate.parsed.meta.key}` : ''}
                    </em>
                    <span className="preview-file">{candidate.fileName}</span>
                    {candidate.parsed.warnings.map((warning) => (
                      <span className="preview-warning" key={warning}>
                        {warning}
                      </span>
                    ))}
                  </div>
                  {candidate.duplicateOf ? <span className="chip warning">Duplicate</span> : null}
                  <button
                    className="icon-btn"
                    aria-label="Remove from import"
                    onClick={() => setCandidates((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              ))}

              {issues.map((issue, index) => (
                <div className="preview-row skipped" key={`${issue.fileName}-${index}`}>
                  <span className="preview-badge">Skipped</span>
                  <div className="preview-main">
                    <strong>{issue.fileName}</strong>
                    <em>{issue.message}</em>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
