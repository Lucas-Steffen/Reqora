import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { AlertTriangle, FileUp, Globe, LoaderCircle, Upload, X } from 'lucide-react'
import { planImport, sourceIdFor, type ImportMode } from '../../importer/plan'
import type { ImportOutcome } from '../../shared/api'
import type { ImportGrouping, Project } from '../../workspace/types'
import type { ImportGateway } from './importGateway'

interface Props {
  project: Project
  gateway: ImportGateway
  /** A file dropped on the window before the dialog opened. */
  initialFile?: File
  onCancel(): void
  onCommit(project: Project, summary: string): Promise<void>
  now?: () => string
}

type Loaded = Extract<ImportOutcome, { ok: true }>

const changeLabels = { added: 'New', updated: 'Updated', unchanged: 'Unchanged', removed: 'Removed', retained: 'Kept' } as const

export default function ImportDialog({ project, gateway, initialFile, onCancel, onCommit, now = () => new Date().toISOString() }: Props): ReactNode {
  const [tab, setTab] = useState<'file' | 'url'>('file')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [grouping, setGrouping] = useState<ImportGrouping>('tags')
  const [mode, setMode] = useState<ImportMode>('merge')
  const [deleteUnmatched, setDeleteUnmatched] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)

  const previousSource = loaded ? project.importSources.find(source => source.id === sourceIdFor(loaded.origin)) : undefined
  useEffect(() => { if (previousSource) setGrouping(previousSource.grouping) }, [previousSource])
  const plan = useMemo(
    () => loaded ? planImport(project, loaded.spec, loaded.origin, { grouping, mode, deleteUnmatched, now: now() }) : null,
    // `now` is intentionally read when the inputs change, not on every render.
    [loaded, project, grouping, mode, deleteUnmatched]
  )

  async function run(load: () => Promise<ImportOutcome | null>): Promise<void> {
    const id = ++requestId.current
    setBusy(true)
    setError('')
    try {
      const outcome = await load()
      if (id !== requestId.current) return
      if (!outcome) return
      if (outcome.ok) setLoaded(outcome)
      else setError(outcome.error.message)
    } catch {
      if (id === requestId.current) setError('The import could not be started. Please try again.')
    } finally {
      if (id === requestId.current) setBusy(false)
    }
  }

  useEffect(() => {
    if (initialFile) void run(() => gateway.fromDroppedFile(initialFile))
    dialogRef.current?.focus()
    // Only for the file present when the dialog opened.
  }, [])

  function onDrop(event: DragEvent): void {
    event.preventDefault()
    event.stopPropagation()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void run(() => gateway.fromDroppedFile(file))
  }

  async function commit(): Promise<void> {
    if (!plan) return
    setBusy(true)
    try {
      const verb = plan.isReimport ? (plan.mode === 'merge' ? 'Merged' : 'Overwrote with') : 'Imported'
      await onCommit(plan.project, `${verb} ${plan.counts.endpoints} endpoints from ${plan.source.title}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The import could not be saved.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <div
        className="modal import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onCancel() } }}
        onDragOver={event => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <header className="modal-header">
          <div>
            <h2 id="import-title">Import OpenAPI / Swagger</h2>
            <p>OpenAPI 3.x or Swagger 2.0, as JSON or YAML.</p>
          </div>
          <button className="icon-button" aria-label="Close import" onClick={onCancel} disabled={busy}><X size={17} /></button>
        </header>

        {!plan ? (
          <div className="modal-body">
            <div className="segmented" role="tablist" aria-label="Import source">
              <button role="tab" aria-selected={tab === 'file'} onClick={() => setTab('file')}><FileUp size={14} /> File</button>
              <button role="tab" aria-selected={tab === 'url'} onClick={() => setTab('url')}><Globe size={14} /> URL</button>
            </div>
            {tab === 'file' ? (
              <div className={`drop-zone ${dragging ? 'dragging' : ''}`} data-testid="import-drop-zone">
                <Upload size={26} />
                <strong>Drop a .json, .yaml or .yml file here</strong>
                <span>Referenced files in the same folder are resolved automatically.</span>
                <button className="primary-button" onClick={() => void run(() => gateway.pickFile())} disabled={busy}>Choose file…</button>
              </div>
            ) : (
              <form className="url-form" onSubmit={event => { event.preventDefault(); if (url.trim()) void run(() => gateway.fromUrl(url.trim())) }}>
                <label htmlFor="import-url">Document URL</label>
                <div className="url-row">
                  <input id="import-url" type="url" placeholder="https://api.example.com/openapi.json" value={url} onChange={event => setUrl(event.target.value)} autoFocus />
                  <button className="primary-button" type="submit" disabled={busy || !url.trim()}>Fetch</button>
                </div>
                <span className="hint">Fetched by Reqora's desktop process: 10 s timeout, 5 redirects, 5 MB maximum.</span>
              </form>
            )}
            {busy && <div className="import-status" role="status"><LoaderCircle size={16} className="spin" /> Reading document…</div>}
            {error && <div className="import-error" role="alert"><AlertTriangle size={16} /> {error}</div>}
          </div>
        ) : (
          <div className="modal-body import-preview">
            <div className="preview-summary">
              <div>
                <strong>{plan.source.title}</strong>
                <span>{plan.source.version ? `v${plan.source.version} · ` : ''}{plan.source.specVersion} · {plan.source.location}</span>
              </div>
              <dl aria-label="Import summary">
                <div><dt>Endpoints</dt><dd>{plan.counts.endpoints}</dd></div>
                <div><dt>Folders</dt><dd>{plan.counts.folders}</dd></div>
                <div><dt>Schemas</dt><dd>{plan.counts.schemas}</dd></div>
                <div><dt>New</dt><dd>{plan.counts.added}</dd></div>
                <div><dt>Updated</dt><dd>{plan.counts.updated}</dd></div>
                <div><dt>{deleteUnmatched ? 'Removed' : 'Kept'}</dt><dd>{deleteUnmatched ? plan.counts.removed : plan.counts.retained}</dd></div>
              </dl>
            </div>
            <div className="import-options">
              <label>
                Folders from
                <select value={grouping} onChange={event => setGrouping(event.target.value as ImportGrouping)} aria-label="Folders from">
                  <option value="tags">First tag (Tag/Sub creates nested folders)</option>
                  <option value="paths">First URL path segment</option>
                </select>
              </label>
              {plan.isReimport && (
                <fieldset className="mode-options">
                  <legend>This document was imported before</legend>
                  <label>
                    <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                    <span><strong>Merge</strong> — update matching endpoints (method + path) and add new ones, keeping your edits to status, maintainer and settings.</span>
                  </label>
                  <label>
                    <input type="radio" name="import-mode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} />
                    <span><strong>Overwrite</strong> — replace matching endpoints with the document's version, discarding your edits to them.</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={deleteUnmatched} onChange={event => setDeleteUnmatched(event.target.checked)} />
                    <span>Also remove endpoints and schemas that are no longer in the document</span>
                  </label>
                </fieldset>
              )}
            </div>
            {!!plan.warnings.length && (
              <details className="import-warnings">
                <summary><AlertTriangle size={14} /> {plan.warnings.length} {plan.warnings.length === 1 ? 'warning' : 'warnings'}</summary>
                <ul>{plan.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
              </details>
            )}
            <div className="preview-table" role="table" aria-label="Endpoints to import">
              <div role="row" className="preview-row head">
                <span role="columnheader">Method</span><span role="columnheader">Path</span><span role="columnheader">Name</span><span role="columnheader">Folder</span><span role="columnheader">Change</span>
              </div>
              {plan.rows.map(row => (
                <div role="row" className={`preview-row change-${row.change}`} key={`${row.method} ${row.path}`}>
                  <span role="cell" className={`method method-${row.method.toLowerCase()}`}>{row.method}</span>
                  <span role="cell"><code>{row.path}</code></span>
                  <span role="cell">{row.name}</span>
                  <span role="cell">{row.folder}</span>
                  <span role="cell" className="change-badge">{changeLabels[row.change]}</span>
                </div>
              ))}
            </div>
            {error && <div className="import-error" role="alert"><AlertTriangle size={16} /> {error}</div>}
          </div>
        )}

        <footer className="modal-footer">
          {plan && <button className="secondary-button" onClick={() => { setLoaded(null); setMode('merge'); setDeleteUnmatched(false) }} disabled={busy}>Back</button>}
          <span className="spacer" />
          <button className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          {plan && (
            <button className="primary-button" onClick={() => void commit()} disabled={busy}>
              {plan.isReimport ? (mode === 'merge' ? 'Merge import' : 'Overwrite import') : `Import ${plan.counts.endpoints} endpoints`}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
