# TASK-007 — Gate de memória e ADR de go/no-go

**Fase:** B

## Status

DONE

## Prioridade

Crítica

## Dependências

TASK-003, TASK-006

## Objetivo

Decidir com números reais se o Tauri compensa.

## Escopo

- Inicialização e ocioso no protótipo com o adapter memory e a mesma fixture de workspace
- Comparação com o baseline da TASK-003
- Ajustes do WebView2 se o resultado empatar

## Subtarefas

- [x] Medir 5 execuções
- [x] Comparar
- [x] Testar `MemoryUsageTargetLevel=Low`, `TrySuspendAsync` e GPU se necessário (não foi necessário: não houve empate)
- [x] Escrever o ADR (ADR-005)

## Critérios de aceite

- [x] ADR com números reais
- [x] Go somente se a memória privada da árvore ficar abaixo da do Electron sem sobreposição dos intervalos mín–máx
- [x] Em empate persistente, decisão devolvida ao usuário (não houve empate)

## Arquivos relacionados

- `docs/migration/DECISIONS.md`
- `docs/migration/BENCHMARKS.md`

## Resultado

**Go** (ADR-005). A memória privada da árvore do Tauri fica abaixo da do Electron em todos os momentos, sem sobreposição dos intervalos mín–máx:

- T+5 s: 202 (201–205) MiB no Tauri contra 232 (232–235) MiB no Electron.
- Fim do ocioso: 191 (183–193) MiB contra 217 (216–220) MiB.

Entregue:

- `scripts/bench/tauri.mjs` (`pnpm bench:tauri`), com os modos `--build`, `--verify` e a medição. Inicialização e ocioso são medidos do mesmo jeito que no `electron.mjs`.
- `scripts/bench/stats.mjs`, com `window` e `at`, agora compartilhados pelos dois hosts.
- `createFetchedWorkspaceRepository` em `workspaceClient.ts`, usado só quando `VITE_REQORA_BENCH_WORKSPACE` está definido (build de bench), com 2 testes.
- Dados brutos em `docs/migration/bench-results/tauri/default/`, e as tabelas e a comparação em `BENCHMARKS.md`.

## Evidências de validação

| Verificação | Resultado |
|---|---|
| `pnpm bench:tauri -- --build` | OK em 2m46s; `target/bench/release/reqora.exe` com 3.262.976 bytes |
| `pnpm bench:tauri -- --verify` | 10 projetos ("Bench project 1" a "10") no seletor; perfil novo usado |
| `pnpm bench:tauri` | 5/5 execuções válidas, 7 a 8 processos por árvore |
| Privada, T+5 s | Tauri 202 (201–205) MiB; Electron 232 (232–235) MiB |
| Privada, pico do ocioso | Tauri 203 (202–208) MiB; Electron 233 (232–235) MiB |
| Privada, fim do ocioso | Tauri 191 (183–193) MiB; Electron 217 (216–220) MiB |
| `pnpm typecheck` | verde |
| `pnpm test` | 17 arquivos, 157 testes verdes (2 novos em `workspaceClient.test.ts`) |
| `pnpm build` | verde |
| `pnpm smoke:electron` | 5 cenários `passed`, saída 0 |
| `cargo test` | ok, 0 testes |
| `cargo clippy -- -D warnings` | sem avisos |

## Pendências

- A residente privada empata e a residente é maior no Tauri; reavaliar na TASK-017.
- Os ajustes do WebView2 (`MemoryUsageTargetLevel=Low`, `TrySuspendAsync`, GPU) não foram medidos; ficam como candidatos para a Fase D.
- Os cenários de carga no Tauri ficam para a TASK-017.
