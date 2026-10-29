# TASK-008 — Camada IPC tipada (platform/)

**Fase:** C

## Status

DONE

## Prioridade

Alta

## Dependências

TASK-007

## Objetivo

Isolar todo `invoke()`/`listen()` em `src/renderer/src/platform/`.

## Escopo

- Adapter Tauri do contrato `ReqoraApi`
- Seleção Tauri → Electron → navegador
- Erros tipados
- Fixtures de contrato TS↔Rust
- Janela 1440×960, mínimo 1000×700

## Subtarefas

- [x] Adapters
- [x] Troca dos 3 gateways
- [x] Fixtures de contrato
- [x] Testes com invoke simulado

## Critérios de aceite

- [x] Smoke Electron verde
- [x] Testes do adapter com invoke simulado verdes

## Arquivos relacionados

- `src/renderer/src/platform/*`
- `src/renderer/src/*Gateway.ts`
- `src/renderer/src/workspaceClient.ts`
- `src/shared/api.ts`, `src/shared/contract/ipc-commands.json`
- `src-tauri/src/ipc.rs`

## Resultado

- **`platform/tauri.ts`**: `createTauriApi(invoke, backend)` implementa o contrato `ReqoraApi` sobre `invoke`.
  - Cada área (workspace, importer, request, secrets, preferences) só existe quando a flag correspondente em `TAURI_BACKEND` é verdadeira. Hoje todas são falsas, porque o Rust ainda não tem commands; cada TASK da Fase C liga a sua. Sem a área, o renderer continua no fallback em página (memory/navegador), como no protótipo da TASK-006.
  - Erros: `PlatformError(code, message)`. Uma rejeição `{ code, message }` do Rust mantém o código; uma string (erro do próprio Tauri, como command inexistente) vira `UNKNOWN`; o resto vira `IPC`.
  - `workspace.save` converte `STALE`, `INVALID` e `IO` no `SaveOutcome` `{ ok: false, code, message }`, igual ao Electron; outros códigos são relançados.
  - `importer.fromDroppedFile` responde `FILE` ("não disponível"): no Tauri o drop chega pelo evento da janela, que entra na TASK-013.
- **`platform/index.ts`**: seleção Tauri → Electron → navegador. `desktopApi()` devolve `Partial<ReqoraApi>` e os gateways caem para o fallback por área (ADR-006).
- **Gateways**: `workspaceClient.ts` e `requestGateway.ts` passam a escolher por área (`api?.workspace`, `api?.request`, `api?.secrets?.reveal`); `importGateway.ts` e `preferences.ts` já faziam isso.
- **Contrato**: `src/shared/contract/ipc-commands.json` fixa o nome de cada command, as chaves camelCase enviadas pelo JS com o parâmetro snake_case do Rust, os códigos de erro e um exemplo de erro.
  - TS: `COMMANDS` e `BACKEND_ERROR_CODES` em `api.ts` são conferidos contra a fixture, e o adapter é exercitado com `invoke` simulado para cada command.
  - Rust: `src-tauri/src/ipc.rs` (`ErrorCode`, `IpcError`, `COMMANDS`) lê a mesma fixture com `include_str!` no `cargo test`.
- **Janela**: 1440×960, mínimo 1000×700, já configurada em `tauri.conf.json` desde a TASK-006 e igual ao Electron.

## Evidências de validação

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | Sem erros |
| `pnpm test` | 18 arquivos, 175 testes verdes (eram 157; +18 de `tauri.test.ts` e `platform.test.ts`) |
| `pnpm build` | Verde |
| `pnpm smoke:electron` | 5 cenários `passed` (search, import, environments, sending, projects) |
| `cargo test` | 3 testes de `ipc` verdes (commands, códigos de erro, ida e volta do erro) |
| `cargo clippy --all-targets -- -D warnings` | Sem avisos |

## Pendências

- O adapter ainda não foi exercitado contra commands Rust reais: as flags de `TAURI_BACKEND` são ligadas pelas TASKs 009, 010, 012 e 013, cada uma com seu teste.
- Drag-drop no Tauri: TASK-013.
