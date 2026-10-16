import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, Globe2, Plus, Trash2, X } from 'lucide-react'
import { addEnvironment, deleteEnvironment, duplicateEnvironment, renameEnvironment, setActiveEnvironment, updateEnvironment } from '../../environments/operations'
import type { Project } from '../../workspace/types'
import VariableTable from './VariableTable'

interface Props {
  project: Project
  onChange(project: Project): void
  onClose(): void
  reveal?(variableId: string): Promise<string | null>
}

const GLOBALS = '__globals__'

export default function EnvironmentManager({ project, onChange, onClose, reveal }: Props): ReactNode {
  const [selectedId, setSelectedId] = useState<string>(project.activeEnvironmentId ?? project.environments[0]?.id ?? GLOBALS)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const environment = project.environments.find(item => item.id === selectedId)
  useEffect(() => { dialogRef.current?.focus() }, [])
  useEffect(() => {
    if (selectedId !== GLOBALS && !environment) setSelectedId(project.environments[0]?.id ?? GLOBALS)
  }, [environment, project.environments, selectedId])
  useEffect(() => setConfirmDelete(false), [selectedId])

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div
        className="modal environment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="environments-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}
      >
        <header className="modal-header">
          <div>
            <h2 id="environments-title">Environments</h2>
            <p>Resolution order for <code>{'{{name}}'}</code>: script (local) variables, then the active environment, then globals.</p>
          </div>
          <button className="icon-button" aria-label="Close environments" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="environment-layout">
          <nav className="environment-list" aria-label="Environment list">
            <button className={selectedId === GLOBALS ? 'selected' : ''} onClick={() => setSelectedId(GLOBALS)}>
              <Globe2 size={13} /> Global variables
            </button>
            <div className="environment-list-heading">ENVIRONMENTS</div>
            {project.environments.map(item => (
              <button key={item.id} className={selectedId === item.id ? 'selected' : ''} onClick={() => setSelectedId(item.id)}>
                <span className={`env-dot ${project.activeEnvironmentId === item.id ? 'active' : ''}`} aria-hidden="true" />
                <span>{item.name}</span>
                {project.activeEnvironmentId === item.id && <span className="sr-only">(active)</span>}
              </button>
            ))}
            <button className="text-button add-row" onClick={() => {
              const result = addEnvironment(project)
              onChange(result.project)
              setSelectedId(result.environment.id)
            }}>
              <Plus size={13} /> New environment
            </button>
          </nav>
          <section className="environment-editor" aria-label={environment ? `Environment ${environment.name}` : 'Global variables'}>
            {environment ? (
              <>
                <div className="field-grid">
                  <label>
                    Name
                    <input
                      key={`${environment.id}:${environment.name}`}
                      defaultValue={environment.name}
                      aria-label="Environment name"
                      onBlur={event => onChange(renameEnvironment(project, environment.id, event.target.value))}
                      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
                    />
                  </label>
                  <label>
                    Base URL
                    <input
                      value={environment.baseUrl}
                      aria-label="Base URL"
                      placeholder="https://api.example.com"
                      onChange={event => onChange(updateEnvironment(project, environment.id, item => ({ ...item, baseUrl: event.target.value })))}
                    />
                  </label>
                </div>
                <div className="environment-actions">
                  <button
                    className="secondary-button"
                    disabled={project.activeEnvironmentId === environment.id}
                    onClick={() => onChange(setActiveEnvironment(project, environment.id))}
                  >
                    {project.activeEnvironmentId === environment.id ? 'Active' : 'Use this environment'}
                  </button>
                  <button className="secondary-button" onClick={() => {
                    const result = duplicateEnvironment(project, environment.id)
                    onChange(result.project)
                    if (result.environment) setSelectedId(result.environment.id)
                  }}>
                    <Copy size={13} /> Duplicate
                  </button>
                  {confirmDelete ? (
                    <>
                      <span className="confirm-text">Delete “{environment.name}” and its secrets?</span>
                      <button className="secondary-button danger-button" onClick={() => onChange(deleteEnvironment(project, environment.id))}>Delete</button>
                      <button className="secondary-button" onClick={() => setConfirmDelete(false)}>Keep</button>
                    </>
                  ) : (
                    <button className="secondary-button danger-button" onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
                <VariableTable
                  label={`Variables in ${environment.name}`}
                  variables={environment.variables}
                  reveal={reveal}
                  onChange={variables => onChange(updateEnvironment(project, environment.id, item => ({ ...item, variables })))}
                />
                {project.importSources.length > 0 && (
                  <div className="service-urls" role="group" aria-label="Imported API base URLs">
                    <div className="detail-section-heading">IMPORTED API BASE URLS</div>
                    <p className="hint">Overrides the server declared in each imported document while this environment is active. Leave empty to use the document's server.</p>
                    {project.importSources.map(source => (
                      <label key={source.id} className="service-url-row">
                        <span>{source.title}</span>
                        <input
                          aria-label={`Base URL for ${source.title}`}
                          placeholder={source.servers?.[0] ?? 'No server in the document'}
                          value={environment.serviceUrls?.[source.id] ?? ''}
                          onChange={event => onChange(updateEnvironment(project, environment.id, item => {
                            const serviceUrls = { ...item.serviceUrls }
                            if (event.target.value) serviceUrls[source.id] = event.target.value
                            else delete serviceUrls[source.id]
                            return { ...item, serviceUrls }
                          }))}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="hint">Global variables apply in every environment. A variable with the same name in the active environment takes precedence.</p>
                <VariableTable label="Global variables" variables={project.globals} reveal={reveal} onChange={globals => onChange({ ...project, globals })} />
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
