# Specs: OpenAPI/Swagger import

## Observed Apidog basis

Static evidence is in [evidence.md](evidence.md). Cited facts are for Apidog 2.8.50; they are not runtime measurements.

**Conversion** (chunk `94743`)
- A document is recognized by a string `openapi` or `swagger` field. JSON is tried first, then YAML.
- Swagger 2.0 is upgraded to OAS 3 before conversion.

**Folders and names**
- The folder is `x-apidog-folder` if present, otherwise the **first tag**. A slash in it creates nested folders. Untagged operations go to the root, and all tags are kept on the endpoint.
- Names fall back in this order: `summary`, `operationId`, first line of `description`, path. The name is capped at 255 characters.

**URL import and merging**
- URL imports are fetched in the **renderer** with axios. The root request has no explicit timeout or redirect cap.
- Re-import modes are overwrite (`methodAndPath`, the default), merge, ignore and keep both, matched by method and path.
- `deleteUnmatchedResources` defaults to off.
- Merging happens on Apidog's server.

**Security schemes**
- `securitySchemes` are kept as reusable schemes.

## Required behavior (Reqora)

- **Formats.** Accept OpenAPI 3.x and Swagger 2.0 as JSON or YAML. Swagger 2.0 is normalized directly rather than upgraded to OAS 3, but produces the same endpoint model.
- **Sources.** Native file picker, drag-and-drop anywhere on the window (or onto the dialog), and HTTP(S) URL.
- **Where work happens.** Files are read and URLs fetched in **Electron main**, through named preload methods: `importer.pickFile`, `fromDroppedFile`, `fromUrl` and `cancel`. No generic IPC is exposed, and no Node runs in the renderer.
  - *Deliberate difference:* Apidog fetches in the renderer.
- **Limits.** Each document may be at most 5 MiB, with a 10 s timeout that includes the body, at most 5 redirects (each one re-validated), and no HTTPS→HTTP downgrade.
  - The whole import has a single 30 s deadline and can be canceled.
  - URLs containing credentials are rejected with a clear message.
  - Error messages never echo document text or credentials.
- **`$ref` resolution.** Internal JSON-pointer references (including `~0`/`~1` and percent-encoding) and external references are resolved.
  - **Local files** may reference only files inside the selected file's folder. The containment check is lexical first, so UNC paths or `file:` URLs with a host never touch the network. It is checked again after `realpath` to catch symlinks. Remote references from local files are not fetched.
  - **URL documents** may reference only the same origin.
  - Recursive references are kept as `{ $ref, x-circular }` with a warning. Expansion is bounded per definition (truncated with a warning) and per import (1M objects, after which the import fails with a `LIMIT` error).
  - YAML aliases are capped.
- **Mapping.** Folders come from the first tag (with `/` nesting) or from the first path segment. Untagged operations go to the project root. Operations carry:
  - every tag;
  - method and path;
  - inherited path-level parameters, overridden by operation parameters;
  - query, header, path and cookie parameters;
  - the request body (raw, form-urlencoded or multipart);
  - response examples, or samples generated from the schema;
  - `deprecated`, which sets the status to *Deprecated*;
  - the security requirement.
  - Component schemas become schema resources in a per-source *Schemas* folder.
  - `securitySchemes` and the document-level `security` are stored for feature 4.
- **Search.** Committing projects the workspace into `SearchRecord`s (`toSearchRecords`) and feeds them to the unchanged pure search module.
- **Preview.** Before anything changes, the preview shows title, version, spec version, location, counts, warnings and per-endpoint rows (New, Updated, Unchanged, Kept or Removed), plus a grouping choice.
- **Re-import.** A source is recognized by a hash of its canonical identity: the real path for files, and the full credential-free URL including the query for URLs. On re-import the user chooses:
  - **Merge:** update spec fields of matched endpoints (method + path). Keep the ID and user-owned fields (status, maintainer, a folder the user moved the endpoint to, and later auth and scripts).
  - **Overwrite:** replace matched endpoints with the document's version.
  - **Remove endpoints no longer in the document:** a separate checkbox, off by default as in Apidog.
  - In every mode, other sources and manual items are left untouched. Cancel changes nothing.
- **Persistence.** The workspace is saved through `WorkspaceRepository`, an atomic temp-file-plus-rename JSON store in `userData`.
  - Revisions are optimistic, and saves are serialized and coalesced.
  - A corrupt file is kept aside.
  - An unreadable file, for any reason other than ENOENT, fails the load instead of being replaced by the demo.

## Out of scope

Leaving these out was deliberate:
- XML and Swagger 1.x
- the GitHub and HTML landing-page heuristics
- per-item checkboxes in the preview
- the "ignore" and "keep both" modes
- `x-apidog-folder` (inferred in the evidence, never seen literally)
