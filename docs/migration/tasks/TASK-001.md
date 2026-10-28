# TASK-001 — Estrutura de gestão, auditoria, pesquisa e ADRs iniciais

**Fase:** A

## Status

DONE

## Prioridade

Alta

## Dependências

—

## Objetivo

Criar a estrutura de gestão da migração e registrar o diagnóstico, a pesquisa de stacks e as primeiras decisões.

## Escopo

- `CLAUDE.md` na raiz
- `docs/migration/` com README, ROADMAP, TASKS, PROGRESS, DECISIONS, BENCHMARKS, audit e research
- Arquivos TASK-001 a TASK-026
- ADR-001 a ADR-004
- Nenhuma mudança de código de produto

## Subtarefas

- [x] Escrever `CLAUDE.md`
- [x] Escrever os documentos de gestão
- [x] Escrever `audit.md` e `research.md`
- [x] Escrever ADR-001 a ADR-004
- [x] Gerar os arquivos de TASK

## Critérios de aceite

- [x] Todos os documentos existem e seguem o modelo da Seção 13
- [x] Links de `research.md` registrados com a fonte
- [x] typecheck, test, build e smoke verdes
- [x] Nenhum código de produto alterado

## Arquivos relacionados

- `CLAUDE.md`
- `docs/migration/*`
- `vitest.config.ts` (só configuração de teste)

## Resultado

Estrutura de gestão criada na branch `migration/tauri`: `CLAUDE.md`, os documentos de `docs/migration/`, os ADRs 001 a 004 e os arquivos TASK-001 a TASK-026. O código de produto não foi alterado. A única mudança fora da documentação é `maxWorkers: 2` em `vitest.config.ts`, necessária para a suíte rodar nesta máquina (ver Evidências).

## Evidências de validação

- `pnpm typecheck`: verde.
- `pnpm test`: 12 arquivos, 134 testes, verde (19,6 s).
- `pnpm build`: verde.
- `pnpm smoke:electron`: 5 cenários verdes (search, import, environments, sending, projects). O primeiro `launch`, rodado logo depois do build com ~1,8 GB de RAM livre, estourou o timeout de 30 s; rodado sozinho em seguida, o smoke passou.

## Pendências

- O smoke Electron é sensível à carga da máquina (registrado em `PROGRESS.md`).
