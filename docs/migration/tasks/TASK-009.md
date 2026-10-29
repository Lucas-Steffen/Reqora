# TASK-009 — Store de workspace em Rust

**Fase:** C

## Status

DONE

## Prioridade

Alta

## Dependências

TASK-008

## Objetivo

Portar o store atômico de workspace e a cópia do perfil legado.

## Escopo

- Escrita atômica com temporário e rename
- Limite de 64 MiB
- Revisão e `StaleRevision`
- Backup `workspace.v<N>.backup.json` e `.corrupt-<ms>`
- Operações serializadas
- Workspace como `serde_json::Value` com `preserve_order`
- Cópia do legado com `legacy-import.json` e hashes

## Subtarefas

- [x] Store
- [x] Cópia do legado
- [x] Portar testes

## Critérios de aceite

- [x] Testes de store e migração portados e verdes
- [x] Salvar uma fixture gera os mesmos bytes que o store TS
- [x] Original legado intacto (hash antes e depois)

## Arquivos relacionados

- `src-tauri/src/store/*`
- `src-tauri/src/migrate/*`
- `src-tauri/src/commands/workspace.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`
- `src/shared/contract/workspace-store/input.json`, `expected.json` e `.gitattributes`
- `src/main/workspaceStore.fixture.test.ts`
- `src/renderer/src/platform/tauri.ts`, `tauri.test.ts`

## Resultado

- **`store/workspace.rs`**: `WorkspaceStore` com `load` e `save` serializados por mutex.
  - Escrita atômica (temporário + rename), limite de 64 MiB, revisão com `STALE`, backup `workspace.v<N>.backup.json` antes de gravar uma versão nova e `.corrupt-<ms>` para arquivo ilegível. Códigos e mensagens iguais aos do `workspaceStore.ts`.
  - O workspace é `serde_json::Value` opaco; o Rust só confere o envelope (`is_workspace`, espelho do `isWorkspace` do TS). Schema e migração v1→v2 continuam em TS (`normalizeWorkspace`, chamado pelo adapter).
- **`store/json.rs`**: serializador que reproduz `JSON.stringify(value, null, 2)`: números pelas regras do ECMAScript, chaves de índice primeiro e serde_json com `preserve_order` e `float_roundtrip`.
- **`migrate/legacy.rs`**: cópia única de `%APPDATA%\reqora` para o diretório de dados do Tauri: `secrets.json`, `preferences.json`, `workspace.*.backup.json` e por último `workspace.json`. Cada arquivo é conferido por SHA-256 e listado em `legacy-import.json`; os originais não são tocados. Se a cópia falhar, o store fica em estado `failed` e nunca cai para o demo.
- **Commands**: `workspace_load` (devolve `null` na primeira execução) e `workspace_save` (`{ ok: true, workspace }`).
- **Fixture de bytes**: `src/shared/contract/workspace-store/` é salva pelo store TS (vitest) e pelo store Rust (`cargo test`), e os dois comparam com o mesmo `expected.json`.
- `TAURI_BACKEND.workspace` continua `false`: ligar o workspace sem o cofre de segredos (TASK-010) perderia os valores secretos.

## Evidências de validação

| Comando | Resultado |
|---|---|
| `cargo test` | 20 testes verdes (eram 3): 11 do store, 4 do legado, 3 do serializador, 2 do contrato IPC |
| `cargo clippy --all-targets -- -D warnings` | Sem avisos |
| `pnpm typecheck` | OK |
| `pnpm test` | 19 arquivos, 179 testes verdes (eram 175: +1 fixture de bytes, +3 do adapter) |
| `pnpm build` | OK |
| `pnpm smoke:electron` | 5 cenários verdes (exit 0) |

- `writes_the_same_bytes_as_the_electron_store` (Rust) e `workspaceStore.fixture.test.ts` (TS) geram bytes idênticos a `expected.json`.
- `copies_the_profile_with_hashes_and_leaves_the_originals` compara o conteúdo do diretório legado antes e depois da cópia.

## Pendências

- Surrogates isolados e números fora da faixa do f64 tornam o arquivo ilegível para o Rust (vira `.corrupt-<ms>`), enquanto o Node os aceita. Não ocorrem em workspaces gerados pelo app.
- O Rust relê o arquivo a cada `load`; o Electron também, então não há regressão.
- Em erro de gravação, o Rust devolve a mensagem genérica do store; o Node repassa a mensagem crua do SO.
- Só Windows validado.
- A cópia real de `%APPDATA%\reqora` no app Tauri em execução não foi exercitada; fica para o smoke da TASK-015.
