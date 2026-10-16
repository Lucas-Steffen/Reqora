# Apidog search investigation and Reqora implementation

Investigation date: 2026-10-16 (America/Cuiaba). The supplied target was `C:\Users\Lucas Steffen\AppData\Local\Programs\Apidog\Apidog.exe`. Analysis started with its **packaged JavaScript in `resources\app.asar`**. The native executable was not analyzed or modified.

## What the packaged code establishes

The relevant feature is **project-tree search**. It is separate from request-history search, Electron find-in-page, editor search, and published documentation search.

| Finding | Exact static evidence |
| --- | --- |
| The default project predicate trims the query, then performs case-insensitive contiguous substring matching against its keyword values. Multiple words remain one phrase. | `dist/renderer/90387.c69ddba9.async.js`, webpack module `464114`, UTF-16 offset **141947**, excerpt **A02**. |
| HTTP endpoint keys include string ID, name, path, tags, ancestor folder names, and module name. This adapter does not include method or description. | Same file, module `224363`, offset **155431**, **A04**. |
| Parameterized endpoint paths have a fallback: replace `{...}` with `[^/]+`, construct a `gi` regular expression, and test the query. The literal parts are unescaped and the pattern is unanchored. | Same predicate/location, **A02**. |
| Metadata categories are combined with AND. Tags use any selected value; empty selections pass. Missing selected metadata fails even under exclusion. | Same file, module `464114`, offset **140595**, **A01**. |
| Matching descendants keep their parent folders visible. Folder names are themselves searchable through descendant keyword arrays. | Same file, modules `829323` / `839204`, offsets **139527** / **145958**, **A03/A05**. |
| The shared input saves a unique, most-recent-first history capped at ten on Enter, supports clearing, and suppresses edits during IME composition. | `dist/renderer/49423.3a17a3ae.async.js`, module `847513`, offsets **24725–26236**, **UI-01/UI-02/UI-03**. |
| The default visible metadata controls are status, tags, and maintainer; additional creator/editor/custom fields exist. | `90387`, modules `551625` / `8789`, **UI-04/UI-05**. |

Representative original code, preserved without renaming identifiers:

```js
e.keywords.some(e=>n?e?.includes(i):e?.toLowerCase().includes(i.toLowerCase()))
```

```js
keywords:[String(e),t,i,...N,...h,...j?[j]:[]],endpointPath:i
```

```js
onPressEnter:()=>{o?.length&&(k([o,...C.filter(e=>e!==o)].slice(0,10)),S(!1))}
```

The enclosing functions, exact ranges, and original byte locations are retained in [core-search-excerpts.json](evidence/core-search-excerpts.json) and [UI evidence](evidence/ui-search-facts.md). These excerpt identifiers are local ledger IDs. Actual REA Evidence IDs are identified separately in the REA report.

## Inferences, kept separate from facts

- The traced project path implements local filtering of already loaded application-store data. It does not call a search service within the inspected predicate and adapter. That does **not** establish that Apidog never sends network requests while loading, synchronizing, or using other search surfaces.
- Folder-name queries can expose entire descendant groups because ancestor names enter each endpoint's keywords; the tree conversion retains the required parents.
- The inspected predicate and tree conversion establish neither fuzzy scoring nor relevance ranking. Reqora therefore preserves source order.
- Search UI strings express shipped interface intent; they are not runtime measurements or proof that every branch was exercised.

## Reqora implementation

Reqora was an empty directory at the start. It now contains a local Electron prototype using the requested Electron + React + TypeScript + electron-vite + pnpm + Tailwind + Vitest stack.

- `src/search/`: pure search and a serializable, asynchronous `SearchRepository` contract. Search runs in the renderer. A future main-process adapter can replace the repository without exposing Electron IPC to UI components.
- `src/renderer/`: API-workspace tree, result list, item detail view, match highlighting, metadata filters, search-field/type controls, recent queries, and keyboard navigation.
- `src/main/` and `src/preload/`: Electron shell with context isolation, sandboxed renderer, and no Node integration or search IPC.
- `src/search/demo.ts`: original synthetic workspace fixtures. No Apidog project content, credentials, or application implementation is imported into the feature.

### Explicit prototype decisions and differences

- Parameterized paths use escaped literal text and an anchored matcher. Complete HTTP(S) URLs are reduced to their pathname. This intentionally tightens Apidog's permissive regex fallback.
- Search-field switches, item-type filters, the result/detail presentation, and Ctrl/Cmd+K are Reqora choices. The verified Apidog Ctrl/Meta+F path is **find-in-page**, not evidence of its project-search shortcut.
- Reqora supports status, tags (including exclusion), and maintainer controls. Its repository also accepts creator/latest-editor filters. Dynamic project custom fields and Apidog's protocol-specific adapters are outside this prototype.
- Reqora searches explicit synthetic item types through a uniform model. Apidog uses distinct adapters for HTTP endpoints, ad hoc requests, docs, schemas, and other resources. HTTP endpoint rules must not be generalized to every Apidog item type.
- The source query retains literal substring semantics. Display-only descriptions and bodies are not indexed. Highlighting uses text nodes and original UTF-16 ranges.

See the [implementation mapping](implementation-mapping.md) for the detailed relationship between source evidence and prototype choices, and the [validation record](validation.md) for the checks actually run.

## Evidence and provenance

| Item | Identity |
| --- | --- |
| Installed ASAR | `C:\Users\Lucas Steffen\AppData\Local\Programs\Apidog\resources\app.asar` |
| ASAR size | **440,675,242 bytes** |
| SHA-256 | `bfc70fa7511ec83de76abbf90386f0f881a44aa444792e0f449a3cf3cf9bab64` |
| Inventory | 43,193 entries; [raw inventory](evidence/raw/asar-inventory.json) |
| Application metadata | `apidog`, version **2.8.50**, main `dist/main/main.js`, read from `resources/app.asar.unpacked/package.json` after packaged-JS inspection; [source digest and JSON locations](evidence/package-metadata.json) |

Offsets are zero-based UTF-16 units within the UTF-8-decoded member. Line and column references are one-based. JSON excerpts also record member-relative and ASAR byte locations. Selected extracted source bytes were compared to the original ASAR and hashed; see [core provenance](evidence/core-search-provenance.json) and [UI provenance](evidence/raw/ui-search-facts.json).

Further material:

- [Core analysis: facts, inferences, limits](core-analysis.md)
- [UI strings, handlers, IPC, and scope evidence](evidence/ui-search-facts.md)
- [REA analysis and reproduction](artifact-analysis.md)
- `tools/`: reproducible inventory, extraction, scanning, and excerpt collection tools
- `evidence/extracted/`: selected original packaged members, retained only as evidence
- `evidence/raw/`: complete inventory, literal scans, and canonical REA output

Original extracted packages and the large raw REA output are excluded from source control by `.gitignore`. They remain saved locally under this directory as requested. Reqora's build does not import them.

## Coverage and remaining unknowns

| Requested question | Status |
| --- | --- |
| Start from `resources/app.asar` | Answered; no native disassembly used. |
| Explain project-search data flow and matching | Answered by static field assembly, predicate, filter, tree, and expansion code. |
| Provide file/location/snippet evidence | Answered with hashes and reproducible JSON/Markdown ledgers. |
| Separate facts from inferences | Separate sections and evidence IDs above and in each ledger. |
| Observe actual Apidog UI/network execution | **Not collected**; no runtime screenshot, live request, response body, latency measurement, or Apidog interaction is claimed. |
| Implement a similar Reqora feature | Implemented as the requested renderer-search Electron prototype; checks are recorded separately. |

This is a focused search investigation. It is not a complete semantic reconstruction of the 441 MB application. REA coverage and integrity limitations are retained rather than treated as proof of missing behavior.
