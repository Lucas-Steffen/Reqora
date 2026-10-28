# TASK-008 — Camada IPC tipada (platform/)

**Fase:** C

## Status

TODO

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

- [ ] Adapters
- [ ] Troca dos 3 gateways
- [ ] Fixtures de contrato
- [ ] Testes com invoke simulado

## Critérios de aceite

- [ ] Smoke Electron verde
- [ ] Testes do adapter com invoke simulado verdes

## Arquivos relacionados

- `src/renderer/src/platform/*`
- `src/renderer/src/*Gateway.ts`
- `src/renderer/src/workspaceClient.ts`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
