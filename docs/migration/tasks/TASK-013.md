# TASK-013 — Import em Rust + Web Worker

**Fase:** C

## Status

TODO

## Prioridade

Alta

## Dependências

TASK-008

## Objetivo

Ler bytes em Rust e rodar o pipeline TS num Web Worker.

## Escopo

- `import_pick`, `import_path`, `import_url`, `import_read_ref`
- Prazo único de 30 s, cancelamento, 5 MB, BOM
- Confinamento léxico e por realpath (`dunce`)
- Mesma origem para URLs
- Drag-drop pela janela

## Subtarefas

- [ ] Comandos
- [ ] Worker
- [ ] Portar testes

## Critérios de aceite

- [ ] Testes de import portados e verdes
- [ ] Identidades iguais às do realpath do Node
- [ ] Smoke de import cobre um drop

## Arquivos relacionados

- `src-tauri/src/commands/import.rs`
- `src/renderer/src/workers/*`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
