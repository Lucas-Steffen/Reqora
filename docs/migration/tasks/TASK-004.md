# TASK-004 — Preferências e histórico de busca no backend

**Fase:** A

## Status

TODO

## Prioridade

Média

## Dependências

TASK-003

## Objetivo

Tirar preferências e histórico de busca do localStorage (perfil Chromium) e gravá-los em `preferences.json` no backend, para que sobrevivam à troca de host.

## Escopo

- Contrato `preferences` em `src/shared/api.ts`
- Store de preferências no main com escrita atômica
- Migração única das chaves `reqora.search.*` do localStorage, mantidas como backup
- Histórico por projeto preservado

## Subtarefas

- [ ] Contrato e store
- [ ] Migração do localStorage
- [ ] Testes novos
- [ ] Smoke de search e projects

## Critérios de aceite

- [ ] Testes novos e antigos verdes
- [ ] Smoke de search e projects verde
- [ ] Histórico por projeto preservado após a migração
- [ ] Chaves antigas continuam no localStorage

## Arquivos relacionados

- `src/renderer/src/preferences.ts`
- `src/shared/api.ts`
- `src/main/*`
- `src/preload/index.ts`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
