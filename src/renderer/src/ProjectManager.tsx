import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, FolderPlus, Pencil, Trash2, X } from 'lucide-react'
import { createProject, deleteProject, duplicateProject, renameProject, setActiveProject } from '../../workspace/projects'
import type { Workspace } from '../../workspace/types'

interface Props {
  workspace: Workspace
  onChange(change: (workspace: Workspace) => Workspace): void
  /** Called after a project is deleted, so per-project local data (search history) can be removed. */
  onDeleted?(projectId: string): void
  onClose(): void
}

/** Create, rename, duplicate, delete and open projects. There is no limit on how many. */
export default function ProjectManager({ workspace, onChange, onDeleted, onClose }: Props): ReactNode {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => { dialogRef.current?.focus() }, [])
  const counts = (id: string) => {
    const project = workspace.projects.find(item => item.id === id)!
    return `${project.endpoints.length} endpoints · ${project.environments.length} environments`
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div
        className="modal project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="projects-title"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}
      >
        <header className="modal-header">
          <div>
            <h2 id="projects-title">Projects</h2>
            <p>{workspace.projects.length} {workspace.projects.length === 1 ? 'project' : 'projects'} · no limit. Each project has its own endpoints, environments and search history.</p>
          </div>
          <button className="icon-button" aria-label="Close projects" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="modal-body">
          <ul className="project-list" aria-label="Project list">
            {workspace.projects.map(project => (
              <li key={project.id} className={project.id === workspace.activeProjectId ? 'active' : ''}>
                <span className="project-icon" aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>
                {renaming === project.id ? (
                  <input
                    className="text-input"
                    aria-label={`New name for ${project.name}`}
                    defaultValue={project.name}
                    autoFocus
                    onBlur={event => { onChange(current => renameProject(current, project.id, event.target.value)); setRenaming(null) }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') { event.stopPropagation(); setRenaming(null) }
                    }}
                  />
                ) : (
                  <div className="project-meta">
                    <strong>{project.name}</strong>
                    <span>{counts(project.id)}{project.id === workspace.activeProjectId ? ' · open' : ''}</span>
                  </div>
                )}
                <div className="project-actions">
                  {project.id !== workspace.activeProjectId && (
                    <button className="secondary-button" onClick={() => { onChange(current => setActiveProject(current, project.id)); onClose() }}>Open</button>
                  )}
                  <button className="icon-button" aria-label={`Rename ${project.name}`} onClick={() => setRenaming(project.id)}><Pencil size={13} /></button>
                  <button className="icon-button" aria-label={`Duplicate ${project.name}`} onClick={() => onChange(current => duplicateProject(current, project.id).workspace)}><Copy size={13} /></button>
                  {confirmDelete === project.id ? (
                    <span className="confirm-inline">
                      <span className="confirm-text">Delete “{project.name}” with all its endpoints, environments and secrets?</span>
                      <button className="secondary-button danger-button" onClick={() => { onChange(current => deleteProject(current, project.id)); onDeleted?.(project.id); setConfirmDelete(null) }}>Delete</button>
                      <button className="secondary-button" onClick={() => setConfirmDelete(null)}>Keep</button>
                    </span>
                  ) : (
                    <button className="icon-button danger-button" aria-label={`Delete ${project.name}`} onClick={() => setConfirmDelete(project.id)}><Trash2 size={13} /></button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <footer className="modal-footer">
          <button className="primary-button" onClick={() => onChange(current => createProject(current).workspace)}>
            <FolderPlus size={14} /> New project
          </button>
          <span className="spacer" />
          <button className="secondary-button" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  )
}
