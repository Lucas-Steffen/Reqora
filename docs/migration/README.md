# Migração Electron → Tauri 2

Esta pasta organiza a migração do Reqora de Electron para Tauri 2. O objetivo é reduzir o consumo de RAM sem perder nenhuma funcionalidade, dado ou teste. A escolha do Tauri só vale depois de medida: o critério de decisão é a TASK-007.

| Arquivo | Conteúdo |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Fases A–E e marcos |
| [TASKS.md](TASKS.md) | Índice das TASKs com estado e dependências, e o backlog |
| [PROGRESS.md](PROGRESS.md) | Diário do que foi feito, com evidências e limitações |
| [DECISIONS.md](DECISIONS.md) | Registros de decisão (ADRs) |
| [BENCHMARKS.md](BENCHMARKS.md) | Método e resultados medidos |
| [audit.md](audit.md) | Diagnóstico do código atual |
| [research.md](research.md) | Pesquisa de stacks, com fontes |
| [tasks/](tasks/) | Um arquivo por TASK |
| `bench-results/` | Dados brutos dos benchmarks (JSON/CSV) |

O procedimento de sessão e as regras de commit estão no [`CLAUDE.md`](../../CLAUDE.md) da raiz.

## Princípios

- O app Electron continua funcionando até a paridade (Fase E).
- O domínio TypeScript fica em TypeScript. Rust recebe o IO de sistema operacional e o que é sensível (arquivos, rede, segredos).
- Formato de dados não muda sem migração e backup. Os dados do Electron são copiados, nunca movidos.
- Nenhum número de desempenho sem medição neste repositório.
