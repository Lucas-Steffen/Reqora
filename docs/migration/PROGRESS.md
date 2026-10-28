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

## 2026-10-28 — TASK-002: harness de benchmark

**Feito**
- Amostrador da árvore de processos (`scripts/bench/sampler.ps1` + `sampler.mjs`), com autoteste.
- Geradores de fixtures determinísticas com hashes registrados, servidor loopback e testes vitest em `scripts/bench/` (incluídos em `pnpm test`).
- Scripts `bench:fixtures` e `bench:selftest`; `.bench/` no `.gitignore`.
- Desvio documentado: Toolhelp32 no lugar de WMI para o PID pai.

**Evidências**
- `pnpm bench:selftest`: PASS — 30 ticks, intervalo mediano 95 ms, 3 processos, filho de 200 MB medido com 203,2 MiB de *Working Set – Private*.
- Fixtures geradas três vezes (`--record`, `--check`, `--check`) com os mesmos SHA-256.
- `pnpm typecheck` verde; `pnpm test` 13 arquivos, 140 testes verdes; `pnpm build` verde.
- `pnpm smoke:electron`: a primeira execução, logo após o build, estourou de novo o timeout de 30 s no `launch` (mesmo caso da TASK-001); as duas execuções seguintes passaram nos 5 cenários.

**Limitações do ambiente**
- O amostrador só existe para Windows; Linux e macOS não foram validados.
