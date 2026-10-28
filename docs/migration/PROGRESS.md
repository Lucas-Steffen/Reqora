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

## 2026-10-28 — TASK-003: baseline Electron

**Feito**
- `scripts/bench/electron.mjs` (`pnpm bench:electron`) roda os 8 cenários com 5 execuções cada, a partir do build de produção.
- `scripts/bench/report.mjs` gera as tabelas.
- Dados brutos em `docs/migration/bench-results/electron/`; resultados e lacunas em `BENCHMARKS.md`.

**Evidências**
- Foram 35 de 35 execuções válidas. Em memória privada, mediana (mín–máx):

| Cenário | Valor |
|---|---|
| T+5 s | 232 (232–235) MiB |
| Fim do ocioso | 217 (216–220) MiB |
| Pico com a resposta grande | 1.167 MiB |
| Pico no uso contínuo | 2.008 MiB |

- `pnpm typecheck` verde; `pnpm test` 13 arquivos, 140 testes verdes; `pnpm build` verde. O smoke Electron não foi rodado, porque a TASK não altera o host (só scripts de bench e docs).

**Limitações do ambiente**
- O primeiro lançamento a frio pode passar de 60 s; um lançamento de aquecimento é descartado antes das medições.
- Só o Windows foi medido.

## 2026-10-28 — TASK-004: preferências no backend

**Feito**
- Contrato `preferences` em `src/shared/api.ts`, store `preferences.json` no main (atômico, versionado, limitado a chaves `reqora.*` e 1 MiB) e exposição no preload.
- O renderer carrega as preferências do backend antes do primeiro render, migra uma vez as chaves do localStorage (mantendo as originais) e usa o localStorage só como fallback.

**Evidências**
- `pnpm typecheck` verde; `pnpm test` 15 arquivos, 151 testes verdes (11 novos); `pnpm build` verde.
- `pnpm smoke:electron`: 5 cenários verdes; o search confere que histórico e filtros sobrevivem a um reload.

**Limitações**
- A migração não foi exercitada sobre a cópia do perfil real de `%APPDATA%\reqora`; só nos testes.
