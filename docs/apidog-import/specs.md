# Specs — OpenAPI/Swagger import

## Observed Apidog basis

Initial verified packaged-code observations: `dist/renderer/94743.05826374.async.js` detects Swagger/OpenAPI versions, invokes a Swagger conversion path, derives folder segments from the first operation tag, and contains external-reference loading; `97494` includes JSON-then-YAML parsing and version recognition. Exact bounded excerpts, hashes, and offsets are recorded in `evidence.md` and the evidence JSON. These static observations do not prove runtime execution. Requirements and choices below belong to Reqora.

## Required behavior

- Accept OpenAPI 3.x and Swagger 2.0 as JSON or YAML, through a native file picker, file drag/drop, or HTTP(S) URL.
- Read/fetch in Electron main through named preload methods. No generic IPC, arbitrary filesystem read API, or Node integration in the renderer.
- Bound each document to 5 MiB, timeout to 10 seconds including the response body, and redirects to five; cap an import's total reference documents and object traversal. Validate every redirected URL and report actionable errors without leaking credentials.
- Resolve internal JSON-pointer references and external relative/absolute document references through an injected loader. Local references stay within the selected file's directory; HTTP sources cannot reference local files. Preserve recursive schema references with an explicit warning rather than expanding forever.
- Map paths/operations into folders/endpoints. Offer tag grouping (first tag, including slash-separated hierarchy) or path grouping, preserving all operation tags as metadata. Preserve method, URL/base server, inherited parameters, headers, request-body examples, response schemas/examples, and security definitions separately from search records.
- Preview title/version/source, endpoint/folder counts, additions/updates/removals, warnings, and endpoint rows before changing the project.
- Merge updates stable method/path identities for that source and retains removed items. Overwrite replaces that source's imported resources only. Both preserve unrelated sources/manual records. Cancel leaves the workspace unchanged.
- Persist the workspace through a replaceable repository and atomically save in main. A committed import immediately refreshes the tree, details, and pure renderer search; reload restores it.

## Acceptance checks

JSON/YAML × OpenAPI/Swagger fixtures; internal/external/escaped-pointer/recursive/unresolved references; tag/path hierarchy; server/basePath and parameter handling; deterministic re-import identities; merge/overwrite isolation; input errors and all transport limits; preview/cancel/commit/search/reload; actual Electron file picker/drop/URL flows against local fixtures and loopback servers only.

## Boundaries

This feature imports request definitions; request execution, environment expansion, scripts, and authentication UI are implemented in their later ordered stages. Imported security metadata is retained now for feature 4. Remote reference downloads only occur as part of the user's explicit import action. Local directory escapes and unsupported URI schemes fail clearly.
