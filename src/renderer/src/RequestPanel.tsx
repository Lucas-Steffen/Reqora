import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, LoaderCircle, Plus, Save, Send, Trash2 } from 'lucide-react'
import { draftFromEndpoint, type RequestDraft } from '../../runner/prepare'
import type { RunResult } from '../../runner/run'
import { HTTP_METHODS, type BodyMode, type Endpoint, type HttpMethod, type KeyValue } from '../../workspace/types'

interface Props {
  endpoint: Endpoint
  baseUrl?: string
  environmentName?: string
  send(draft: RequestDraft): Promise<RunResult>
  save(draft: RequestDraft): Promise<void>
  /** Extra tabs contributed by later features (scripts, auth). */
  extraTabs?: { id: string; label: string; render(): ReactNode }[]
  /** Extra result panes (script console, test results). */
  renderResultExtras?(result: RunResult): ReactNode
}

type Section = 'query' | 'headers' | 'pathParams' | 'cookies' | 'body'
const sectionLabels: Record<Section, string> = { query: 'Params', pathParams: 'Path', headers: 'Headers', cookies: 'Cookies', body: 'Body' }

function KeyValueEditor({ label, rows, onChange }: { label: string; rows: KeyValue[]; onChange(rows: KeyValue[]): void }): ReactNode {
  const update = (index: number, change: Partial<KeyValue>) => onChange(rows.map((row, i) => i === index ? { ...row, ...change } : row))
  return (
    <div className="kv-table" role="table" aria-label={label}>
      {rows.map((row, index) => (
        <div className="kv-row request-kv" role="row" key={index}>
          <input type="checkbox" aria-label={`Enable ${row.key || 'row'}`} checked={row.enabled} onChange={event => update(index, { enabled: event.target.checked })} />
          <input aria-label={`${label} name`} placeholder="name" value={row.key} onChange={event => update(index, { key: event.target.value })} />
          <input aria-label={`${label} value for ${row.key || 'row'}`} placeholder="value or {{variable}}" value={row.value} onChange={event => update(index, { value: event.target.value })} />
          <button type="button" className="icon-button" aria-label={`Remove ${row.key || 'row'}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 size={13} /></button>
        </div>
      ))}
      <button type="button" className="text-button add-row" onClick={() => onChange([...rows, { key: '', value: '', enabled: true }])}><Plus size={13} /> Add</button>
    </div>
  )
}

function formatBody(body: string, contentType?: string): string {
  if (contentType?.includes('json') || /^\s*[{[]/.test(body)) {
    try { return JSON.stringify(JSON.parse(body), null, 2) } catch { /* keep raw */ }
  }
  return body
}

export default function RequestPanel({ endpoint, baseUrl, environmentName, send, save, extraTabs = [], renderResultExtras }: Props): ReactNode {
  const [draft, setDraft] = useState<RequestDraft>(() => draftFromEndpoint(endpoint))
  const [section, setSection] = useState<string>('query')
  const [result, setResult] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'request'>('body')

  useEffect(() => {
    setDraft(draftFromEndpoint(endpoint))
    setResult(null)
    setDirty(false)
    // Reset only when switching endpoints; saving the same endpoint keeps the draft.
  }, [endpoint.id])

  const change = (next: Partial<RequestDraft>) => { setDraft(previous => ({ ...previous, ...next })); setDirty(true) }
  const contentType = result?.response?.headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1]

  async function onSend(): Promise<void> {
    setBusy(true)
    try {
      setResult(await send(draft))
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : 'The request failed.', unresolved: [] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="request-panel">
      <form className="request-line" onSubmit={event => { event.preventDefault(); void onSend() }}>
        <select aria-label="Method" value={draft.method} onChange={event => change({ method: event.target.value as HttpMethod })}>
          {HTTP_METHODS.map(method => <option key={method}>{method}</option>)}
        </select>
        <input aria-label="Request URL" value={draft.url} onChange={event => change({ url: event.target.value })} spellCheck={false} />
        <button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />} Send</button>
        <button className="secondary-button" type="button" disabled={!dirty || busy} onClick={async () => { await save(draft); setDirty(false) }}><Save size={14} /> Save</button>
      </form>
      <div className="request-base hint">
        {/^https?:\/\//i.test(draft.url) || draft.url.startsWith('{{')
          ? 'Absolute URL: the environment base URL is not added.'
          : baseUrl ? <>Base URL from <strong>{environmentName}</strong>: <code>{baseUrl}</code></> : 'No environment selected: use an absolute URL or choose an environment.'}
      </div>
      <div className="segmented request-sections" role="tablist" aria-label="Request parts">
        {(Object.keys(sectionLabels) as Section[]).map(key => (
          <button key={key} role="tab" aria-selected={section === key} onClick={() => setSection(key)}>
            {sectionLabels[key]}
            {key !== 'body' && draft[key].filter(row => row.enabled).length > 0 && <span className="tab-count">{draft[key].filter(row => row.enabled).length}</span>}
          </button>
        ))}
        {extraTabs.map(tab => <button key={tab.id} role="tab" aria-selected={section === tab.id} onClick={() => setSection(tab.id)}>{tab.label}</button>)}
      </div>
      <div className="request-section">
        {section === 'body' ? (
          <div className="body-editor">
            <select aria-label="Body type" className="inline-select" value={draft.body.mode} onChange={event => change({ body: { ...draft.body, mode: event.target.value as BodyMode } })}>
              {(['none', 'json', 'text', 'xml', 'form-urlencoded', 'form-data'] as BodyMode[]).map(mode => <option key={mode} value={mode}>{mode}</option>)}
            </select>
            {draft.body.mode === 'form-urlencoded' || draft.body.mode === 'form-data'
              ? <KeyValueEditor label="Form fields" rows={draft.body.form ?? []} onChange={form => change({ body: { ...draft.body, form } })} />
              : draft.body.mode !== 'none' && <textarea className="code-input" aria-label="Request body" spellCheck={false} value={draft.body.raw ?? ''} onChange={event => change({ body: { ...draft.body, raw: event.target.value } })} />}
          </div>
        ) : section in sectionLabels ? (
          <KeyValueEditor label={sectionLabels[section as Section]} rows={draft[section as Exclude<Section, 'body'>]} onChange={rows => change({ [section]: rows })} />
        ) : extraTabs.find(tab => tab.id === section)?.render()}
      </div>

      {result && (
        <section className="response-panel" aria-label="Response">
          {!!result.unresolved.length && (
            <div className="import-error warning" role="status"><AlertTriangle size={14} /> Unresolved variables: {result.unresolved.map(name => `{{${name}}}`).join(', ')}</div>
          )}
          {result.error && <div className="import-error" role="alert"><AlertTriangle size={14} /> {result.error}</div>}
          {result.response && (
            <>
              <div className="response-meta">
                <span className={`status-code status-${String(result.response.status)[0]}xx`}>{result.response.status} {result.response.statusText}</span>
                <span>{result.response.timeMs} ms</span>
                <span>{result.response.sizeBytes.toLocaleString('en-US')} B{result.response.truncated ? ' (truncated)' : ''}</span>
              </div>
              <div className="segmented" role="tablist" aria-label="Response parts">
                <button role="tab" aria-selected={responseTab === 'body'} onClick={() => setResponseTab('body')}>Body</button>
                <button role="tab" aria-selected={responseTab === 'headers'} onClick={() => setResponseTab('headers')}>Headers</button>
                <button role="tab" aria-selected={responseTab === 'request'} onClick={() => setResponseTab('request')}>Sent request</button>
              </div>
              {responseTab === 'body' && <pre className="code-preview response-body"><code>{formatBody(result.response.body, contentType)}</code></pre>}
              {responseTab === 'headers' && <pre className="code-preview"><code>{result.response.headers.map(([name, value]) => `${name}: ${value}`).join('\n')}</code></pre>}
            </>
          )}
          {result.request && (result.response ? responseTab === 'request' : true) && (
            <pre className="code-preview" aria-label="Sent request"><code>{`${result.request.method} ${result.request.url}\n${result.request.headers.map(([name, value]) => `${name}: ${value}`).join('\n')}${result.request.body ? `\n\n${result.request.body}` : ''}`}</code></pre>
          )}
          {renderResultExtras?.(result)}
        </section>
      )}
    </div>
  )
}
