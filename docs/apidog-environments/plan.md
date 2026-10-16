# Plan: multiple environments

1. **Specs:** evidence collected (`tools/scan-environments.cjs`, 80 facts); [specs.md](specs.md).
2. **Build the domain:**
   - `src/environments/variables.ts`: scopes, precedence, substitution and redaction.
   - `operations.ts`: CRUD.
   - `src/runner/prepare.ts`: request assembly.
   - `run.ts`: resolve, send and redact.
   - Workspace model fields, plus `normalizeWorkspace` so feature-1 files keep loading.
3. **Build main:**
   - `secretStore.ts`: `safeStorage`, atomic, never plaintext.
   - `secretVariables.ts`: extract and annotate at the store boundary.
   - `http/sendRequest.ts`.
   - IPC `request.send` and `secrets.reveal`.
4. **Build the UI:**
   - topbar switcher, `EnvironmentManager`, `VariableTable` with write-only secrets, `RequestPanel`;
   - `useWorkspace` reworked so edits apply in order and saves are coalesced.
5. **Test:**
   - Vitest for substitution, precedence, base URL and request assembly;
   - environment operations;
   - the secret store with a fake cipher, checking nothing reaches disk in plaintext;
   - main-process send against loopback, checking redaction;
   - the UI manager and request flow;
   - an Electron smoke test using real `safeStorage` and a loopback API.
6. **Review:** an independent review, with findings resolved before scripts begin.
