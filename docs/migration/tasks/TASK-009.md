# TASK-009 — Store de workspace em Rust

**Fase:** C

## Status

TODO

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

- [ ] Store
- [ ] Cópia do legado
- [ ] Portar testes

## Critérios de aceite

- [ ] Testes de store e migração portados e verdes
- [ ] Salvar uma fixture gera os mesmos bytes que o store TS
- [ ] Original legado intacto (hash antes e depois)

## Arquivos relacionados

- `src-tauri/src/store/*`
- `src-tauri/src/migrate/*`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
