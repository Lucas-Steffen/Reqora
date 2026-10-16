# Request sending for imported endpoints

## Root cause (reproduced 2026-10-16, before the fix)

**Reproduction.** A diagnostic run of the built Electron app with a temporary profile and a loopback mock:
1. Import `http://127.0.0.1:<port>/openapi.json` by URL. Its `servers` is `[{url: http://127.0.0.1:<port>/api}]`.
2. Open each imported endpoint and press **Send** on the Request tab.

**Observed**

| Endpoint | URL shown | Sent to | Result | Mock server hits |
| --- | --- | --- | --- | --- |
| List pets | `/pets` | `http://127.0.0.1:4010/pets` | `Could not reach 127.0.0.1:4010 (ECONNREFUSED)` | 0 |
| Get pet | `/pets/{petId}` | `http://127.0.0.1:4010/pets/` | same | 0 |

**Causes, confirmed in code**
1. **The document's `servers` were discarded.**
   - `readSpec` computed `spec.servers`, but `planImport` never stored it (no field on `ImportSource` or `Endpoint`). Nothing in `src/runner` or the UI read it.
   - The runner's only base URL was `activeEnvironment(project)?.baseUrl`. Imported endpoints were therefore sent to whatever unrelated environment was active (the demo "Local", `127.0.0.1:4010`). With no environment, the error was "not a complete URL".
   - The `/api` base path was lost as well.
2. **Required path parameters with no value were silently removed.** `prepareRequest` replaced `{petId}` with an empty string, so the request went to `/pets/` instead of reporting the missing value.
3. **Error messages exposed raw socket codes** (`ECONNREFUSED`) instead of explaining DNS, TLS, refused-connection and timeout failures.

The HTTP call itself, the IPC path and the main-process sender were working: the request did leave the app, just to the wrong address.

## Specs (fix)

**Base URL resolution.** The base URL is resolved in this order, highest first. This is Apidog's per-service model (environments hold `baseUrls[serviceId]`, falling back to `"default"`), adapted so that each import source is a service.
1. The URL is absolute (`http(s)://`) or starts with `{{`: nothing is prepended.
2. The active environment's **service URL** for the endpoint's import source (`environment.serviceUrls[sourceId]`), if set.
3. The endpoint's own OpenAPI `servers` (operation or path level), otherwise its import source's first `servers` entry.
   - Server variables use their defaults.
   - Relative server URLs (`/api`) are resolved against the document URL for URL imports. They cannot be resolved for file imports and are skipped.
4. The active environment's base URL (used by manually created endpoints).
5. None of these applies: a clear error asks the user to set a base URL.

The Request tab shows which rule applied and the resulting base URL.

**Importing servers as environments**
- When importing into a project with **no environments**, one environment is created per server. It is named after the server's description, or the host if there is none, and its service URL is set for that source. The first one becomes active.
- Otherwise, a checkbox (off by default) adds them.

**Rest of the request**
- `{{variables}}` are applied to the base URL, path, path/query parameters, headers, cookies and body, as in feature 2.
- A path parameter that ends up empty, or a `{name}` placeholder left in the path, stops the request with "Fill in path parameter(s): …" before anything is sent.

**Transport**
- The request runs in Electron main through the narrow `request.send` IPC. It is not subject to CORS.
- Limits: 30 s timeout and a 10 MiB response cap.
- Errors are classified as:
  - `DNS`: the host name can't be resolved;
  - `REFUSED`: nothing is listening;
  - `RESET`;
  - `TLS`: certificate problems, named;
  - `TIMEOUT`;
  - `INVALID_URL`;
  - `NETWORK`: anything else.
  Each message names the host.
- The response shows status, time, size, headers and body (formatted when it is JSON).

**Tests.** Local mock servers only: the loopback HTTP server, the loopback TLS server with a self-signed certificate, and an unresolvable `.invalid` host for DNS errors. Nothing third-party.

## Validation

| Check | Result |
| --- | --- |
| `pnpm typecheck` / `pnpm build` | pass |
| `pnpm test` | 119 tests pass. `src/main/sending.main.test.ts` covers: URL import → plan → send against a loopback mock (spec server chosen over an unrelated active environment, relative-server resolution, operation-level servers, query/header/path params, JSON body, status/time/size/headers/body), environment service-URL override, servers → environments, base-URL precedence, missing/unresolved path params, transport error classification, and a real refused connection and timeout |
| `pnpm smoke:electron sending` | pass in the built app ([smoke-result.json](evidence/smoke-result.json), screenshots `send-list-pets.png`, `send-dns-error.png`) |

Notes:
- DNS and TLS classification is unit-tested with injected Node error codes.
- The Electron smoke resolves `reqora-smoke.invalid`. The `.invalid` TLD is reserved by RFC 6761 and never resolves, so no HTTP request leaves the machine.

## Impact

- Endpoints imported from a document with `servers` are sent to that server out of the box, whatever environment is active.
- Each environment can override the base URL per imported API, just as Apidog's per-service base URLs do.
- On import, the document's servers can become environments. This is on by default when the project has no environments.
- Requests are no longer sent to a silently wrong path when a path parameter is missing.
- Failures name the host and the class of failure, so they are easy to act on.
