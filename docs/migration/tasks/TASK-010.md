# TASK-010 — Cofre de segredos

**Fase:** C

## Status

DONE

## Prioridade

Alta

## Dependências

TASK-009

## Objetivo

Chave-mestra no keyring do SO e `secrets.v2.json` com AES-256-GCM.

## Escopo

- keyring 4.2
- AES-256-GCM com nonce único por valor
- Regras atuais: extração de todos os projetos, `copySecretFrom`, `retainOnly`, `reveal` restrito
- `secrets.json` legado nunca sobrescrito

## Subtarefas

- [x] Cofre
- [x] Comandos
- [x] Portar testes com keyring em memória

## Critérios de aceite

- [x] Testes de segredos portados e verdes
- [x] Mensagem de keyring indisponível idêntica à atual

## Arquivos relacionados

- `src-tauri/src/secrets/mod.rs`
- `src-tauri/src/store/workspace.rs`, `src-tauri/src/commands/workspace.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`
- `src/renderer/src/platform/tauri.ts`, `tauri.test.ts`, `platform.test.ts`

## Resultado

- **`secrets/mod.rs`**: `SecretVault` com chave-mestra de 256 bits no keyring do SO (serviço `reqora`, usuário `master-key`, crate `keyring` 4.2) e valores em `secrets.v2.json` (`{"version":1,"secrets":{id:{nonce,ciphertext}}}`), cada um cifrado com AES-256-GCM e nonce aleatório de 96 bits. Gravação atômica; o `secrets.json` legado nunca é lido nem escrito.
- **Regras do Electron espelhadas**: `extract_secrets` (antes de gravar: guarda valores não vazios, copia por `copySecretFrom`, remove `copySecretFrom`, esvazia o valor, `retain_only` para órfãos e variáveis que deixaram de ser secretas) e `annotate_secrets` (`hasStoredSecret` ao carregar).
- **Store**: `WorkspaceStore::with_secrets`; a extração roda antes de qualquer escrita, então uma falha do cofre não altera nada em disco.
- **Fail-closed**: sem chave no keyring, `set` e `save` falham com `IO` e a mesma mensagem do `SecretStoreUnavailableError`.
- **Command `secret_reveal`**: só para id string com menos de 200 unidades UTF-16 e variável `secret: true` no workspace gravado.
- **Adapter**: áreas `workspace` e `secrets` ligadas em `TAURI_BACKEND`.

## Evidências de validação

| Comando | Resultado |
|---|---|
| `cargo test` | 32 testes verdes (eram 20): 7 do cofre, 5 de integração store + cofre |
| `cargo clippy --all-targets -- -D warnings` | Sem avisos |
| `pnpm typecheck` | OK |
| `pnpm test` | 19 arquivos, 179 testes verdes |
| `pnpm build` | OK |
| `pnpm smoke:electron` | 5 cenários verdes (exit 0) |

Testes portados (keyring em memória, `MemoryKeyProvider`):
- `environments.main.test.ts` → `never_writes_secret_values_in_plain_text_and_annotates_them_on_load`, `keeps_blank_secrets_copies_on_duplicate_and_drops_orphans_and_unsecreted_values`, `refuses_to_store_secrets_when_the_keychain_is_unavailable`.
- `projects.main.test.ts` (isolamento de segredos) → `isolates_secrets_between_a_project_and_its_duplicate`, com o projeto duplicado montado como o `duplicateProject` produz.
- Novo: `reveals_only_secret_variables_of_the_stored_workspace`.
- A mensagem em `SECRET_UNAVAILABLE` é idêntica, caractere por caractere, à de `src/main/secretStore.ts:23`.

## Pendências

- O keyring real do Windows (Credential Manager) não é exercitado em teste automatizado; só o provedor em memória. Fica para o smoke da TASK-015.
- Segredos do Electron (`secrets.json`, DPAPI) ainda não migram: TASK-011. Até lá, no Tauri, segredos copiados do legado aparecem sem valor.
- Só Windows validado.
