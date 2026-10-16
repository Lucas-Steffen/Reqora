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

## Search

- Press **Ctrl+K** or **Cmd+K**, then enter a name, URL path, tag, ID, or folder name. Queries use one trimmed, case-insensitive phrase.
- Use the field selector to choose searchable fields and filter by status, tags, or maintainer. Tags support exclusion. Selected metadata categories combine with AND; values inside a category combine with OR.
- Filters also work without a text query. Resource type chips control which kinds are included.
- **↑ / ↓** select a result, **Enter** opens it, and **Escape** clears the query. Clicking a result also opens its preview and reveals its folder.
- Search history and validated preferences are stored locally. Enter or opening a result commits the query; history keeps the ten most recent distinct phrases.

Search and data access run in the renderer. The Promise-based `SearchRepository` interface in `src/search/types.ts` is the replacement point for a future main-process or IPC adapter. The pure search module has no Electron, browser storage, React, or network dependency. Electron uses a sandboxed renderer with context isolation; the preload intentionally exposes no APIs.

This prototype previews resource details and examples. It does not send API requests or import live collections.

## Verify

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:electron
```

Vitest covers the search predicates and the rendered workflow, including keyboard navigation, IME composition, filter-only search, history and preference recovery, stale asynchronous responses, highlighting, and literal markup. The smoke script starts the actual built Electron app with a hidden window and a temporary profile, tests the workflow, and saves screenshots under `docs/apidog-search/evidence/reqora-runtime/`.

## Evidence and architecture

- [Apidog search investigation](docs/apidog-search/README.md): artifact identity, source locations, observations, inferences, and limits.
- `src/search/`: serializable records, deterministic search, and memory repository.
- `src/renderer/src/`: React workspace, search controls, local preferences, and UI tests.
- `src/main/` and `src/preload/`: Electron shell and process boundaries.
- `electron.vite.config.ts`: main, preload, and renderer builds; `vite.renderer.config.ts`: optional browser development.

The reconstruction is an original Reqora implementation informed by the inspected behavior. Apidog's packaged code is retained only as local investigation evidence and is excluded from version control.
# Reqora
