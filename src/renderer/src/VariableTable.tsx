import { useState, type ReactNode } from 'react'
import { Eye, EyeOff, KeyRound, Plus, Trash2 } from 'lucide-react'
import { createVariable } from '../../environments/operations'
import type { Variable } from '../../workspace/types'

interface Props {
  label: string
  variables: Variable[]
  onChange(variables: Variable[]): void
  /** Decrypts a stored secret for display (main process). */
  reveal?(variableId: string): Promise<string | null>
}

/**
 * Secret values are write-only here: the field starts empty, typing a new
 * value and leaving the field saves it (the main process encrypts it and
 * blanks it in the workspace). The eye button asks main to decrypt it.
 */
function SecretValue({ variable, onCommit, reveal }: { variable: Variable; onCommit(value: string): void; reveal?: Props['reveal'] }): ReactNode {
  const [draft, setDraft] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const commit = () => {
    if (draft) onCommit(draft)
    setDraft('')
    setShown(null)
  }
  return (
    <div className="secret-value">
      <input
        type={shown !== null ? 'text' : 'password'}
        aria-label={`Value of ${variable.key || 'variable'}`}
        placeholder={variable.hasStoredSecret ? '•••••••• (stored encrypted)' : 'Secret value'}
        value={shown ?? draft}
        readOnly={shown !== null}
        autoComplete="off"
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') commit() }}
      />
      {variable.hasStoredSecret && reveal && (
        <button
          type="button"
          className="icon-button"
          aria-label={shown !== null ? `Hide ${variable.key}` : `Reveal ${variable.key}`}
          onClick={async () => setShown(shown !== null ? null : (await reveal(variable.id)) ?? '')}
        >
          {shown !== null ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  )
}

export default function VariableTable({ label, variables, onChange, reveal }: Props): ReactNode {
  const update = (id: string, change: Partial<Variable>) => onChange(variables.map(variable => variable.id === id ? { ...variable, ...change } : variable))
  const duplicates = new Set(variables.filter((variable, index) => variable.key && variables.findIndex(other => other.key === variable.key) !== index).map(variable => variable.key))
  return (
    <div className="kv-table variable-table" role="table" aria-label={label}>
      <div className="kv-row head" role="row">
        <span role="columnheader" className="sr-only">Enabled</span>
        <span role="columnheader">Name</span>
        <span role="columnheader">Value</span>
        <span role="columnheader">Secret</span>
        <span role="columnheader" className="sr-only">Remove</span>
      </div>
      {variables.map(variable => (
        <div className="kv-row" role="row" key={variable.id}>
          <input type="checkbox" aria-label={`Enable ${variable.key || 'variable'}`} checked={variable.enabled} onChange={event => update(variable.id, { enabled: event.target.checked })} />
          <input
            aria-label="Variable name"
            placeholder="name"
            value={variable.key}
            className={duplicates.has(variable.key) ? 'invalid' : ''}
            title={duplicates.has(variable.key) ? 'Duplicate name: the first enabled row wins' : undefined}
            onChange={event => update(variable.id, { key: event.target.value })}
          />
          {variable.secret
            ? <SecretValue variable={variable} reveal={reveal} onCommit={value => update(variable.id, { value })} />
            : <input aria-label={`Value of ${variable.key || 'variable'}`} placeholder="value" value={variable.value} onChange={event => update(variable.id, { value: event.target.value })} />}
          <label className="secret-toggle" title="Secret: stored encrypted, masked in the UI and in logs">
            <input type="checkbox" aria-label={`Secret ${variable.key || 'variable'}`} checked={variable.secret} onChange={event => update(variable.id, { secret: event.target.checked, ...(event.target.checked ? {} : { value: '', hasStoredSecret: false }) })} />
            <KeyRound size={13} />
          </label>
          <button type="button" className="icon-button" aria-label={`Remove ${variable.key || 'variable'}`} onClick={() => onChange(variables.filter(item => item.id !== variable.id))}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="text-button add-row" onClick={() => onChange([...variables, createVariable()])}>
        <Plus size={13} /> Add variable
      </button>
    </div>
  )
}
