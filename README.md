# Reqora

A runnable Electron API workspace prototype with project search, built with Electron, React, TypeScript, electron-vite, Tailwind CSS, pnpm, and Vitest. The sample Commerce API is original synthetic data.

## Run

Use Node.js 22.13+ and pnpm 11.25.0. If `pnpm` is not installed in your terminal, install the pinned version once:

```bash
npm install --global pnpm@11.25.0
```

In an already open Git Bash/UCRT64 terminal, run `hash -r` after installing. Then start the project:

```powershell
pnpm install
pnpm dev
```

For the production build:

```powershell
pnpm build
pnpm start
```

`pnpm dev:renderer` runs the same React UI in a browser at `http://127.0.0.1:5173` for UI development. `pnpm preview:renderer` previews an existing renderer build.

## Projects

- **No limit on projects.** Apidog caps imports at five projects; Reqora has no cap. Each project has its own endpoints, folders, import sources, environments, secrets and search history.
- Use the project selector in the sidebar to switch projects. The layers button opens **Projects**, where you can create, rename, duplicate, delete and open projects.
- Workspaces saved by earlier versions are migrated automatically. The original file is kept as `workspace.v1.backup.json` in the app's data folder.

## Import OpenAPI / Swagger

- Accepts OpenAPI 3.x and Swagger 2.0, as JSON or YAML.
- Three ways in:
  - the upload button in the sidebar, then **Choose file…**;
  - drag a file onto the window;
  - **URL**: the file is fetched by the desktop process, so CORS does not apply. Limits: 10 s, 5 redirects, 5 MB.
- The preview lets you import into a **new project** (the default) or the **current project**.
  - When re-importing a document, choose **Merge** or **Overwrite**. Removing endpoints that are no longer in the document is optional.
  - The document's `servers` can become environments.

## Environments and sending requests

- Choose an environment in the top bar, and edit environments with the button next to it. Each environment has a base URL, variables, and a base URL for each imported API.
- `{{variable}}` resolves in this order: script-local first, then the active environment, then project globals.
- Variables marked **secret** are encrypted with the operating system's key store (Electron `safeStorage`). They are never written to disk in plain text, and they are masked in the UI and in responses.
- Open an endpoint and use the **Request** tab to edit params, path, headers, cookies and body, then **Send**.
  - The request runs in the desktop process. The response shows status, time, size, headers and body.
  - The base URL comes from, in order: the environment's base URL for that imported API, the document's server, then the environment's base URL. The tab shows which one applies.

## Search

- Press **Ctrl+K** or **Cmd+K**, then type a name, URL path, tag, ID or folder name. A query is one trimmed, case-insensitive phrase.
- Search covers **This project** by default. Switch to **All projects** to search everywhere; opening a result from another project switches to that project.
- The field selector chooses which fields are searched and filters by status, tags or maintainer.
  - Tags support exclusion.
  - Different categories combine with AND; values within a category combine with OR.
- **↑ / ↓** select a result, **Enter** opens it, and **Escape** clears the query.
- Search history is kept per project.

The pure search module (`src/search/`) has no Electron, storage, React or network dependency. Storage sits behind `WorkspaceRepository`: an atomic JSON file in Electron main, or memory in tests and the browser. The renderer is sandboxed with context isolation. The preload exposes only the named methods in `src/shared/api.ts` (`workspace`, `importer`, `request`, `secrets`), and every handler checks the sender and its arguments.

## Verify

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:electron            # all scenarios: search import environments sending projects
pnpm smoke:electron sending    # or a single scenario
```

Vitest covers search, import (parsing, `$ref`, mapping, merge), environments and secrets, sending against loopback mock servers, multi-project isolation and migration, and the UI. The Electron smoke script starts the built app with a hidden window and a throwaway profile, and runs each scenario against a local mock server. No test contacts a third-party service.

## Evidence and architecture

- **Apidog investigations:** [search](docs/apidog-search/README.md), [import](docs/apidog-import/evidence.md), [environments](docs/apidog-environments/evidence.md), [scripts](docs/apidog-scripts/evidence.md), [auth](docs/apidog-auth/evidence.md). Each one keeps facts (file and offset) separate from inferences.
- **Stage records:** [progress](docs/implementation-progress.md), [request sending (root cause)](docs/request-sending/README.md), [projects](docs/projects/README.md).
- **Code:**
  - `src/search/`: pure search.
  - `src/workspace/`: model, projects, repository.
  - `src/importer/`: OpenAPI pipeline.
  - `src/environments/`: variables.
  - `src/runner/`: request preparation and base URLs.
  - `src/main/`: IO, IPC, HTTP, secrets.
  - `src/preload/`: the narrow API.
  - `src/renderer/src/`: the UI.

Reqora is an original implementation informed by the inspected behavior. Apidog's packaged code is used only as local investigation evidence and is excluded from version control.
