# Specs: multiple environments

## Observed Apidog basis (facts in [evidence.md](evidence.md))

**Model**
- Environments hold `name`, `baseUrls` keyed by service, `variables` and `parameters`.
- Variables have:
  - a shared `initialValue` and a device-local `value`, with `isBindInitial` deciding which applies;
  - `securityType` set to `"default"` or `"secret"`;
  - `description` and `isFixedValue`.

**Operations**
- Create, update, delete, duplicate (which copies local values), reorder, import/export and change current.
- `-1` means "no environment". Deleting the current environment resets to none, and a lone environment is auto-selected.

**Precedence** (highest first): local/temp > test data > environment > module > project global > team > vault.

**Substitution**
- The script runtime uses `/\{\{([^{}]*?)}}/g`, repeated up to 19 passes. Unresolved tokens stay literal, and `{{obj.a}}` / `{{arr[0]}}` path access is supported.
- It applies to URL, params, headers, body and auth, and skips disabled rows.

**Base URL**
- The base URL is prepended unless the path is absolute or starts with `{{`.
- The join is plain concatenation.

**Secrets**
- Secrets are masked with a reveal toggle, excluded from search and blanked on export.
- No at-rest encryption was found (zero `safeStorage`/`keytar` hits).

## Required behavior (Reqora)

**Model**
- Each project has `environments[]`, `activeEnvironmentId` (`null` = No environment) and `globals[]`.
- An environment has `id`, `name`, `baseUrl` and `variables[]`.
- A variable has `id`, `key`, `value`, `secret`, `enabled`, `description?`.
- *Simplification:* one value per variable. Reqora is local-only, so the shared/local split has no purpose. One base URL per environment, since there is no multi-service support.

**Operations** (pure functions in `src/environments/operations.ts`)
- create, with unique names; a lone environment becomes active when none is;
- rename;
- duplicate: new IDs, inserted after the source, secrets copied in main;
- delete: resets the active environment if it was the deleted one;
- switch.
- **UI:** a topbar selector, plus a manager dialog with a list, a Global variables entry, name and base URL fields, a variable table, *Use this environment*, *Duplicate*, and *Delete* with confirmation.

**Precedence** (documented in the UI and in code, `SCOPE_ORDER`)
1. local: set by a script during the run (feature 3)
2. active environment
3. globals

Inside a scope, the first enabled row with a given name wins. Duplicate names are highlighted.

**Substitution**
- Uses Apidog's regex, up to 19 passes, so nested and recursive variables work. Names are trimmed and support JSON path access.
- Unresolved names stay literal and are reported after sending.
- Applied to the base URL, URL, path params (`{id}`), query, headers, cookies, raw body and form fields. Disabled rows are skipped.
- *Improvement:* the base URL join normalizes slashes.

**Secrets**
- **Storage.** A variable marked secret is never stored in `workspace.json`. On save, main moves the value into `secrets.json`, encrypted with Electron `safeStorage` (DPAPI on Windows), and blanks it.
  - If encryption is unavailable, saving fails rather than falling back to plaintext.
  - Secrets of deleted variables are removed. Unmarking a variable as secret deletes its stored secret.
- **Renderer.** Secret values are write-only (commit on blur or Enter). An explicit reveal button decrypts a secret through `secrets.reveal`, which is validated against the variable being secret.
- **Sending.** Sending happens in main, where secrets are decrypted. Everything returned to the renderer has secret values masked as `••••••`: the sent request, the response body and headers, and errors.
- **Search.** Secrets are never indexed: variables are not part of `toSearchRecords`.

**Requests**
- The detail panel gets a **Request** tab: method, URL, Params/Path/Headers/Cookies/Body editors, *Send* and *Save*.
- Responses show status, time, size, headers, body and the sent request.
- Requests are sent from main with a 30 s timeout and a 10 MiB response cap. Tests use loopback only.

## Out of scope

Vault references, environment parameters, import/export, reorder, multiple services per environment and per-device local values.
