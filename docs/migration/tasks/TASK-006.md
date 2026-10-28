# TASK-006 — Scaffold de src-tauri

**Fase:** B

## Status

TODO

## Prioridade

Alta

## Dependências

TASK-005

## Objetivo

Criar o projeto Tauri que carrega a UI atual, sem tocar no Electron.

## Escopo

- `src-tauri` reaproveitando `vite.renderer.config.ts` (dev em 127.0.0.1:5173, saída `out/renderer`)
- CSP e capabilities mínimas
- Adapter `memory` para rodar sem backend

## Subtarefas

- [ ] Scaffold
- [ ] Configuração de CSP e capabilities
- [ ] Adapter memory
- [ ] Build release

## Critérios de aceite

- [ ] `tauri dev` e `tauri build` (release) abrem a UI
- [ ] Electron intacto
- [ ] Testes TS verdes

## Arquivos relacionados

- `src-tauri/*`
- `src/renderer/src/platform/*`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
