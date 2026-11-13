# TASK-011 — Migração de segredos do Electron (DPAPI)

**Fase:** C

## Status

DONE

## Prioridade

Alta

## Dependências

TASK-010

## Objetivo

Abrir os segredos `v10` do Electron no Windows.

## Escopo

- DPAPI libera `os_crypt.encrypted_key` de `Local State`
- AES-GCM abre blobs `v10`
- Falha marca `hasStoredSecret: false` e nunca apaga

## Subtarefas

- [x] Gerar vetor de teste com o Electron real
- [x] Implementar
- [x] Testar inclusive `secrets.json` ausente

## Critérios de aceite

- [x] Fixture real decifrada
- [x] Falha marca o segredo para redefinir e nunca apaga

## Arquivos relacionados

- `src-tauri/src/migrate/secrets.rs`, `src-tauri/src/migrate/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`
- `src-tauri/tests/fixtures/electron-secrets/` (`secrets.json`, `expected.json`, `aes-key.hex`)
- `scripts/fixtures/electron-secrets.cjs`

## Resultado

- **`migrate/secrets.rs`**: `unwrap_key` lê `os_crypt.encrypted_key` de `Local State`, tira o prefixo `DPAPI` e chama `CryptUnprotectData` (`windows-sys`, só `cfg(windows)`, com `CRYPTPROTECT_UI_FORBIDDEN`). `open_blob` abre `v10` + nonce de 12 bytes + AES-256-GCM.
- **`migrate_secrets`** roda depois de uma cópia do legado bem-sucedida. Para cada id do `secrets.json` copiado:
  - já está no cofre: mantém o valor do Reqora;
  - abre: grava no cofre (`secrets.v2.json`);
  - não abre (chave ausente, blob adulterado, valor não string): fica fora do cofre e aparece com `hasStoredSecret: false`, que é o estado em que a UI atual já pede para redefinir.
- Grava `secrets-migration.json` com `migrated` e `failed` (só ids, nunca valores) e não roda de novo. Sem `secrets.json` não faz nada. Se o keyring estiver indisponível, falha sem relatório e tenta de novo no próximo início.
- `secrets.json` nunca é alterado nem apagado; nenhum valor é gravado em texto puro.
- **Vetor de teste real**: `scripts/fixtures/electron-secrets.cjs` rodou no Electron 44.8.0 (`safeStorage`) e gerou 4 segredos (ASCII, Unicode com emoji, vazio, 4096 caracteres). A chave AES do perfil descartável foi desembrulhada por DPAPI e versionada como `aes-key.hex`, para que o teste rode em qualquer usuário; ela não protege nada real.

## Evidências de validação

| Comando | Resultado |
|---|---|
| `cargo test` | 43 testes verdes (eram 32) e 1 ignorado; +11 da migração de segredos |
| `REQORA_ELECTRON_PROFILE=<perfil> cargo test migrates_a_real_electron_profile -- --ignored` | Verde: `Local State` real, DPAPI do usuário atual, 4/4 segredos no cofre |
| `cargo clippy --all-targets -- -D warnings` | Sem avisos |
| `pnpm typecheck` | OK |
| `pnpm test` | 19 arquivos, 179 testes verdes (sem mudança no TS) |
| `pnpm build` | OK |

- `opens_the_blobs_of_the_real_electron`: os 4 blobs do Electron abrem com os valores de `expected.json`.
- `rejects_tampered_foreign_and_malformed_blobs`: tag adulterada, prefixo `v11`, blob curto, base64 inválido, vazio e outra chave dão `None`.
- `a_failed_secret_is_marked_to_be_set_again_and_never_deleted`: o id com falha fica fora do cofre, `annotate_secrets` o marca `hasStoredSecret: false` e os bytes de `secrets.json` não mudam.
- `without_secrets_json_there_is_nothing_to_migrate`, `without_the_key_every_secret_fails_and_nothing_is_lost`, `without_a_keychain_it_retries_on_the_next_start`, `an_unreadable_secrets_json_is_left_for_the_next_start`, `a_value_already_in_the_vault_is_kept`.
- `unwraps_a_dpapi_key_and_migrates_from_the_legacy_profile`: `CryptProtectData` → `Local State` → `unwrap_key` → migração completa.
- `pnpm smoke:electron` não foi rodado: nada do renderer nem do host Electron mudou.

## Pendências

- Só Windows. No macOS (Keychain) e no Linux (libsecret/`v11`) todo segredo fica marcado para redefinir; a migração nessas plataformas segue no backlog.
- O app Tauri em execução não foi exercitado com um perfil real; fica para o smoke da TASK-015.
- O aviso na UI é o estado existente `hasStoredSecret: false`; não há mensagem dedicada para "segredo não migrado".
