# Multiple projects (unlimited)

Reqora exists partly because Apidog limits imports to 5 projects. Reqora has **no limit** on the number of projects, and the code contains no project cap anywhere.

## Specs

**Model.** `Workspace { version: 2, revision, activeProjectId, projects: Project[] }`.
- Each project owns its folders, endpoints, resources, import sources, environments, active environment and global variables. Scripts and auth (features 3 and 4) will also live on `Project`.
- Search history is kept per project, under the browser-storage key `reqora.search.history.v1:<projectId>`. Search field and type preferences stay global.

**Isolation.**
- IDs are unique *within* a project, and every lookup is scoped to one project.
- Sending carries `projectId`.
- Secrets are keyed by variable ID. Variable IDs are random and are regenerated when a project is duplicated, so two projects never share a secret entry.
- Cross-project views (search across all projects) use composite keys `<projectId>::<id>`.

**Operations** (pure, `src/workspace/projects.ts`)
- **Create:** a blank project with a unique name.
- **Rename:** a blank name is ignored.
- **Duplicate:** deep copy with a new project ID and new variable IDs. Secret values are copied through `copySecretFrom`, encrypted in main, and the name becomes "X copy". Source IDs are kept, so re-importing the same document into the copy is recognized as a re-import.
- **Delete:** removes the project. Its secrets are deleted by the store's orphan sweep and its search history key is removed. Deleting the last project leaves a new blank "My project", because a workspace always has at least one project.
- **Switch:** sets `activeProjectId`.

**UI.**
- A project switcher sits in the sidebar header, plus a **Projects** dialog with: list, New, Rename (inline), Duplicate, Delete (with confirmation), and Open.
- The tree, request tab, environments and import preview always act on the active project.

**Import target.** The import preview asks **Import into: New project "<document title>" / Current project "<name>"**.
- The default is *New project*, unless this document was already imported into the current project. Then the default is the current project, with merge/overwrite.
- The preview names other projects that already contain the same document.
- A new project gets environments from the document's servers.

**Search scope.**
- **This project** (the default) searches only the active project.
- **All projects** searches every project, and breadcrumbs start with the project name.
- Opening a result from another project switches to that project and selects the item.
- The scope is remembered.

**Migration** (no data loss).
- A version-1 file (single- or multi-project) is migrated in memory to version 2. Missing fields are filled in, and nothing is removed.
- Before the first save in the new format, the original file is copied once to `workspace.v1.backup.json`.
- The global search history from earlier versions moves to the project that is active at first launch, and the old key is then removed.

## Plan

1. Add the domain: `projects.ts` (operations, isolation-safe duplicate), `migrateWorkspace` (v1→v2), and `RunInput.projectId`.
2. Update main: the store migrates and makes the backup; IPC validation covers `projectId`.
3. Build the UI: switcher, Projects dialog, import target choice, search scope and per-project history.
4. Test: unit tests for operations, migration and isolation (including secrets on duplicate and delete); UI tests for the switcher, the dialog, import-to-new-project and cross-project search; an Electron smoke test with a real v1 file migration and many projects.
5. Review, then ship with commits and push.
