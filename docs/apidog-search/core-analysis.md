# Apidog project-tree search: static core analysis

Scope: the installed `resources/app.asar` supplied by the user. These are observations of packaged JavaScript, never observations of execution or live network traffic. The native executable has not been analyzed. Exact snippets and byte/UTF-16 locations are in [`evidence/core-search-excerpts.json`](evidence/core-search-excerpts.json); extraction provenance, SHA-256 and declared member integrity are in [`evidence/core-search-provenance.json`](evidence/core-search-provenance.json). Excerpt IDs A01–A09 below are local evidence identifiers, not REA Evidence IDs.

## Facts established by packaged code

| ID | Location in original ASAR member | Observation |
|---|---|---|
| A01 | `dist/renderer/90387.c69ddba9.async.js`, module 464114, UTF-16 offset 140595 | Status, tags, maintainer, creator, latest editor and custom-field predicates test selected values. Tags use `some`, status and user IDs use `includes`. Empty selections pass. A selected field that is undefined fails, including in exclusion mode. |
| A02 | Same member/module, offset 141947 | Query is `t?.trim()` and each keyword uses `e?.toLowerCase().includes(i.toLowerCase())` by default. There is no token split, edit-distance scoring, ranking or index in this predicate. After keyword matching, a loop rejects a node if any selected metadata predicate fails. |
| A02 | Same member/module, offset 141947 | Endpoint-path fallback is `RegExp(e.replace(/\{[^}]+\}/g,"[^/]+"),"gi").test(t)` only when path contains `{` and `}`. It catches regex errors. The pattern is not anchored and the literal path is not otherwise escaped. |
| A03 | Same member, module 829323, offset 139527 | Folder names are collected from the starting folder ID through successive `parentId` values. Stops at zero/missing parent and guards cycles with a `Set`. |
| A04 | Same member, module 224363, offset 155431 | HTTP endpoint predicate gets ID as a string, name, path, tags, folder ancestor names and project module name. HTTP endpoint tags are normalized to an array. Method and description are absent from this exact field list. |
| A05 | Same member, module 839204, offset 145958 | A folder is retained if its own ID matches or recursively filtered children remain. An HTTP endpoint is rejected if its ID is outside `httpApis`; an accepted endpoint calls child conversion without the filter argument. Thus associated API cases remain under a matching endpoint. |
| A06 | Same member, module 224363, offset 162423 | The separate ad hoc HTTP request adapter supplies `[name,method,path]`. Its fields differ from HTTP endpoint fields; these scopes must not be conflated. |
| A07 | `dist/renderer/20401.291e096a.async.js`, module 699516, offset 193100 | Search and filters are local store state. `isFiltering` depends on a nonempty trimmed query or filter list. |
| A08 | Same member, module 505671, offset 191545 | Expansion state has `expandedKeys` and `expandKeysToRestore`; filtering records expansion, expands eligible containers and restores the recorded keys when filtering ends. Schema/component/security/request entrances are excluded from the blanket expansion list. |
| A09 | `dist/renderer/90387.c69ddba9.async.js`, module 224363, offset 159218 | Hooks filter in-memory application store lists to IDs, assemble a filter object, and pass that object into tree conversion. Tree children remain in traversal order here. |

For example, the exact HTTP endpoint assembly includes:

```js
keywords:[String(e),t,i,...N,...h,...j?[j]:[]],endpointPath:i
```

with the destructured identifiers and ancestor/module lookups preserved in A04. The exact substring predicate includes:

```js
e.keywords.some(e=>n?e?.includes(i):e?.toLowerCase().includes(i.toLowerCase()))
```

in A02. The optional boolean defaults to `false` in the enclosing function; the inspected caller supplies only node and query.

## Inferences and reconstruction decisions

- This path implements local project-tree filtering over store data. It does not require a remote search request in the inspected predicate/adapter path. This is not proof that the application never contacts a server elsewhere or while loading/syncing that store.
- Typing a folder or module name can reveal descendant endpoints because their searchable keyword arrays contain those names. Ancestor folders are retained when matching descendants survive conversion.
- Text matching is a trimmed, case-insensitive contiguous substring. Multiple words are one literal phrase; no fuzzy matching or ranking is established for this project-tree path.
- HTTP endpoint search can find a literal concrete URL fragment against a parameterized endpoint path through its fallback. The shipped regular-expression construction also interprets metacharacters in literal path text. A reconstruction should explicitly choose whether to retain that edge case or use safe escaped path matching.
- A minimal similar Reqora feature should implement an in-memory renderer search service with explicit searchable fields, tags/status/user filters, ancestor-preserving tree pruning, history and expansion restoration. Richer types, shortcut keys, debounce timing and result presentation must be identified separately or labeled as Reqora decisions.

## Limits and separate search surfaces

Published-document search settings (`6238`/`35282`) refer to Algolia/local site indexes and are separate from project-tree search. `49423` also contains a distinct find-in-page bar using Electron IPC `Search.StartFindInPage`/`Search.StopFindInPage`; its 800 ms debounce must not be attributed to project-tree search. Monaco/Vim search libraries and their fuzzy-search strings are also separate surfaces.

No live requests, response bodies, latency, runtime shortcuts or ranking behavior were observed. No credentials or user-created Apidog project data were read. Static imports identify store APIs and data flow; they do not by themselves establish runtime reachability.
