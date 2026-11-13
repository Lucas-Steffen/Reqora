# TASK-012 — Envio HTTP com reqwest

**Fase:** C

## Status

DONE

## Prioridade

Alta

## Dependências

TASK-010

## Objetivo

Portar o envio de requisições com os mesmos limites e erros.

## Escopo

- 30 s, corte exato em 10 MiB com `truncated`, 20 redirecionamentos
- Descompressão
- Classificação de erros pela cadeia de causas
- Mascaramento
- `request_cancel`
- Segredos no envio por placeholder (ADR-010)
- ADR rustls × native-tls (ADR-011)

## Subtarefas

- [x] Cliente
- [x] Substituição de placeholders
- [x] Mascaramento
- [x] Cancelamento
- [x] Testes loopback

## Critérios de aceite

- [x] Testes Rust de envio e mascaramento em loopback verdes
- [x] Testes do adapter verdes
- [x] Envio restrito ao projeto

## Arquivos relacionados

- `src-tauri/src/http/{mod.rs,secrets.rs,loopback.rs,tests.rs}`
- `src-tauri/src/commands/http.rs`
- `src-tauri/src/store/workspace.rs` (`send_secrets`)
- `src/renderer/src/platform/tauri.ts`, `tauri.test.ts`
- `src/renderer/src/requestGateway.ts`
- `src/shared/api.ts`, `src/shared/contract/ipc-commands.json`
- `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts` (paridade do `request.cancel` no Electron)

## Resultado

- **Cliente** (`http/mod.rs`): reqwest 0.13 com native-tls (ADR-011), prazo único de 30 s, corpo lido em stream e cortado exatamente em 10 MiB com `truncated: true`, `Policy::limited(20)`, gzip, brotli e deflate.
- **Erros:** a classificação percorre a cadeia de causas (io, hyper, TLS, DNS) e devolve os mesmos `SendErrorCode` e textos do Electron.
- **Segredos (ADR-010):** o WebView roda o `runRequest` com placeholders `rqs_<nonce>_<i>` e manda só as referências usadas. O Rust valida cada uma contra o workspace gravado (variável secreta, habilitada, do ambiente ativo ou das globais do projeto informado), substitui conforme a posição (cru em headers e corpo, percent-encoded na URL, form-encoded no corpo urlencoded), envia e mascara resposta e erros com "••••••", incluindo as formas codificadas. Valor que não abre é enviado como `{{chave}}` e reportado em `unresolved`.
- **Cancelamento:** novo `request_cancel` no Rust e `request.cancel` opcional no contrato, também implementado no Electron para manter paridade.
- **Adapter Tauri:** `TAURI_BACKEND.request = true`; o envio exige o workspace carregado e devolve "The workspace is still loading." enquanto ele não chega.

## Evidências de validação

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | limpo |
| `pnpm test` | 190 testes em 19 arquivos (antes 179); 10 novos em "Tauri request send (ADR-010)" |
| `pnpm build` | OK |
| `pnpm smoke:electron` | exit 0; search, import, environments, sending e projects verdes |
| `cargo test` | 67 passed, 1 ignored (inclui loopback de envio, corte em 10 MiB, redirecionamentos, descompressão, timeout, conexão recusada, cancelamento, mascaramento e validação de refs por projeto) |
| `cargo clippy --all-targets -- -D warnings` | limpo |

## Pendências

- Visualizador de respostas grandes (arquivo temporário, carregamento sob demanda): TASK-018.
- TLS em Linux e macOS não validado (só Windows disponível).
- Defesa contra WebView comprometido exfiltrando segredos: CSP e capabilities na TASK-014.
- O reqwest devolve o texto de status canônico, não o enviado pelo servidor (diferença já registrada no plano).
