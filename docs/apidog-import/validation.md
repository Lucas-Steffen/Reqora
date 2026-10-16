# Validation and review: OpenAPI/Swagger import

## Commands (2026-10-16, Windows 11, Node 24.21, Electron 44.8)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | pass |
| `pnpm test` | 78 tests pass across 5 files (at this gate) |
| `pnpm build` | pass |
| `pnpm smoke:electron search import` | both scenarios pass ([smoke-result.json](evidence/reqora-runtime/smoke-result.json)) |

Network use in tests is limited to loopback servers started by the tests. No third-party host is contacted.

## What the tests cover

**Domain** (`src/importer/importer.test.ts`):
- detection of JSON/YAML × OAS3/Swagger 2, plus 7 kinds of invalid input
- the YAML alias cap
- escaped and percent-encoded pointers
- internal, external, parameter and recursive references
- path-level parameter override
- form bodies, deprecation and Swagger body/formData conversion
- the external-document cap
- tag and path grouping, nested tags, root placement
- security inheritance
- searchability through `searchRecords`
- merge, overwrite and delete-unmatched isolation
- deterministic IDs
- review regressions: fan-out `LIMIT`, parse errors that don't echo the document, "Schemas" tag collision, blank names, merge keeping user folders, canonical source identity

**Main** (`src/main/import.main.test.ts`, loopback server and temp directories):
- redirects, redirect loops and redirects to `file:`
- total timeout, size limit via content-length and via chunked streaming
- HTTP status, invalid URL, unsupported scheme, refused connection
- credential redaction
- sibling and escaping references
- UNC references rejected without touching the filesystem
- no remote references from local files
- same-origin-only references for URL documents
- whole-import deadline and cancel
- identity of files with the same name in different folders
- atomic store and revisions
- unreadable file vs. corrupt file

**UI** (`src/renderer/src/ImportDialog.test.tsx`):
- picker → preview → commit → tree, search and persisted state
- re-import merge/overwrite choice
- URL error and cancel without saving
- window drop
- browser fallback gateway

**Electron smoke** (`scripts/smoke/import.mjs`):
- real main-process file read with the OS dialog stubbed at the boundary
- real drag-and-drop of an on-disk file
- URL import through main with redirect and external reference
- 10 s timeout and `ftp://` errors
- re-import with overwrite
- reload persistence
- screenshots: `import-preview.png`, `import-reimport.png`, `import-timeout-error.png`, `import-tree.png`

## Independent review: findings and resolution

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | A `file://host/share` or `//host` ref reached `realpath`, which triggers SMB/NTLM before the containment check | Host-bearing `file:` URLs are rejected. Containment is checked lexically before any filesystem call, and again after `realpath`. UNC paths dropped from the renderer are refused. |
| 2 | High | Exponential `$ref` fan-out froze the main thread (21 s) | A per-import expansion budget (1M objects) gives a `LIMIT` error. `splitRef` results are cached. The regression test finishes in well under 5 s. |
| 3 | Medium | Source ID came from the base name or a URL without its query, so different documents counted as re-imports | `ImportOrigin.identity` holds the real path or the full URL. Only its 64-bit hash is stored. |
| 4 | Medium | Any read error loaded the demo, which could then be saved over user data | Only ENOENT seeds the demo. Other errors fail load and save. |
| 5 | Medium | External refs allowed arbitrary outbound GETs (SSRF) | URL documents follow same-origin refs only. Local files never fetch remote refs. |
| 6 | Medium-low | No overall deadline or cancel | 30 s whole-import deadline, a `importer.cancel` IPC, and Cancel/Close stay enabled while loading. |
| 7 | Medium-low | 32-bit IDs could collide | IDs are now 64-bit (two seeded FNV-1a halves). |
| 8 | Medium-low | Merge moved endpoints out of folders the user had put them in, and skipped newly deprecated ones | Merge keeps the user's folder. *Deprecated* is set when the user has no status. |
| 9 | Low | Dropping during preview or commit swapped the document, and a double commit was possible | Drops are ignored while busy, during preview or during commit. Commit has its own guard. |
| 10 | Low | A tag named "Schemas" shared the schemas folder | The schemas folder uses its own key prefix. |
| 11 | Low | A blank first description line produced an empty name | The first non-blank line is used, then the path. |
| 12 | Low | Credential URLs were reported as a "network error"; raw `$ref`s and V8 JSON messages could echo content | Explicit credential-URL error. `displayRef` strips userinfo and query. JSON errors report position only. |
