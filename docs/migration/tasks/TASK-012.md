# TASK-012 — Envio HTTP com reqwest

**Fase:** C

## Status

TODO

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
- Segredos no envio por placeholder (ADR a escrever)
- ADR rustls × native-tls

## Subtarefas

- [ ] Cliente
- [ ] Substituição de placeholders
- [ ] Mascaramento
- [ ] Cancelamento
- [ ] Testes loopback

## Critérios de aceite

- [ ] Testes Rust de envio e mascaramento em loopback verdes
- [ ] Testes do adapter verdes
- [ ] Envio restrito ao projeto

## Arquivos relacionados

- `src-tauri/src/http/*`
- `src-tauri/src/commands/http.rs`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
