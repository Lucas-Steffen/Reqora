# Progresso

Diário da migração, do mais antigo para o mais recente. Cada entrada registra o que foi feito, as evidências e as limitações.

## 2026-10-28 — TASK-001: estrutura de gestão

**Feito**
- Branch `migration/tauri` criada a partir de `main` (`065322e`).
- `CLAUDE.md` na raiz com o procedimento de sessão e as regras.
- `docs/migration/`: README, ROADMAP, TASKS, PROGRESS, DECISIONS (ADR-001 a 004), BENCHMARKS (só método), audit, research e `tasks/TASK-001.md` a `TASK-026.md`.

**Evidências**
- `pnpm typecheck`: verde.
- `pnpm test`: 12 arquivos, 134 testes, verde.
- `pnpm build`: verde.
- `pnpm smoke:electron`: 5 cenários verdes (search, import, environments, sending, projects).

**Limitações do ambiente**
- **vitest com um fork jsdom por núcleo falhava ao iniciar** ("Failed to start forks worker … Timeout") em 5 arquivos, com ~1,2 GB de RAM livre e muitos processos de outras ferramentas abertos. Nenhum desses processos é do Reqora. Correção: `maxWorkers: 2` em `vitest.config.ts` (commit separado). Com isso, os 134 testes passaram.
- **O smoke Electron estourou o timeout de 30 s no primeiro `launch`** quando rodou logo depois do build, com ~1,8 GB livres. Rodado sozinho em seguida, passou nos 5 cenários. Não foi alterado: é sensível à carga da máquina, e isso fica registrado para os benchmarks.
- O smoke regrava as screenshots de evidência com diferenças mínimas de pixel; elas foram restauradas para não misturar mudanças de evidência a commits de documentação.
