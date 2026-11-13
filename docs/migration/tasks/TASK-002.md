# TASK-002 — Harness de benchmark e fixtures

**Fase:** A

## Status

DONE

## Prioridade

Alta

## Dependências

TASK-001

## Objetivo

Ter um harness reproduzível que mede a árvore de processos inteira e fixtures determinísticas para os cenários.

## Escopo

- Amostrador PowerShell de longa duração a 100 ms seguindo o PID pai de cada processo
- Métricas: WorkingSet64, PrivateMemorySize64, Working Set – Private, CPU
- Geradores de fixtures com seed fixa e hash: OpenAPI de 1.000 endpoints, JSON de 20 MB, workspace com N projetos
- Servidor loopback para as respostas

## Subtarefas

- [x] Escrever o amostrador
- [x] Autoteste do amostrador contra uma árvore conhecida
- [x] Escrever os geradores de fixtures
- [x] Registrar os hashes
- [x] Servidor loopback

## Critérios de aceite

- [x] Autoteste do amostrador passa
- [x] Gerar as fixtures duas vezes produz os mesmos hashes
- [x] O amostrador não entra na árvore medida

## Arquivos relacionados

- `scripts/bench/sampler.ps1` — amostrador (C# via `Add-Type`)
- `scripts/bench/sampler.mjs` — inicia/para o amostrador e agrega o CSV por tick
- `scripts/bench/sampler-selftest.mjs` — autoteste (`pnpm bench:selftest`)
- `scripts/bench/fixtures.mjs` — geradores; `--record` grava e `--check` confere os hashes (`pnpm bench:fixtures`)
- `scripts/bench/fixtures.sha256.json` — hashes registrados
- `scripts/bench/server.mjs` — servidor loopback (127.0.0.1)
- `scripts/bench/fixtures.test.mjs` — testes vitest (rodam em `pnpm test`)
- `docs/migration/BENCHMARKS.md`

## Resultado

- **Amostrador.** Um único processo PowerShell compila um helper C# e amostra a cada 100 ms. A árvore sai de um snapshot Toolhelp32 (`th32ParentProcessID`, o mesmo valor de `Win32_Process.ParentProcessId`), sem o custo de uma consulta WMI por tick. Um filho só entra se foi criado depois do pai, o que impede que um PID reutilizado entre na árvore. A memória vem de `K32GetProcessMemoryInfo` (`PROCESS_MEMORY_COUNTERS_EX2`): `WorkingSetSize`, `PrivateUsage` e `PrivateWorkingSetSize`. A CPU vem de `GetProcessTimes`. A busca desce a partir da raiz, então o amostrador nunca mede a si mesmo.
- **Desvio do plano §7:** o plano citava `Win32_Process`; foi usado Toolhelp32, que fornece o mesmo PID pai sem WMI. Registrado em `BENCHMARKS.md`.
- **Fixtures** (seed `20261028`): `openapi-1000.json` (1.000 operações, importa como 1.000 endpoints distintos), `large-20mib.json` (array JSON de 20 MiB) e `workspace-10x100.json` (workspace v2 válido, 10 projetos × 100 endpoints). Saída em `.bench/fixtures/` (ignorado pelo git).
- **Servidor loopback** com `/bench/large-json`, `/bench/small-json`, `/bench/status`, `/bench/echo` e `/fixtures/<nome>` (nomes com `/`, `..` ou `%2F` dão 404). Qualquer outro caminho responde um JSON pequeno, para que todo endpoint importado possa ser enviado.

## Evidências de validação

- `pnpm bench:selftest` (Node 24.21, PowerShell 5.1.26100): árvore de um pai Node com dois filhos, um deles com `Buffer.alloc(200e6)`.
  ```
  ticks=30 medianGapMs=95 maxGapMs=111 processes=3
  tree ws=354.4 MiB priv=248.6 MiB wsPriv=227.6 MiB; heavy wsPriv=203.2 MiB
  PASS sampler self-test
  ```
  Verifica: exatamente os 3 PIDs esperados, PIDs pais corretos, nem o amostrador nem o harness na árvore, memória privada do filho pesado ≥ 95% de 200 MB, intervalo mediano entre 80 e 150 ms.
- `node scripts/bench/fixtures.mjs --record` e depois `--check` duas vezes: hashes iguais.

  | Fixture | SHA-256 | Bytes |
  |---|---|---|
  | `openapi-1000.json` | `cc3f46253552c415a2c49797715866a72cdfb60b3b0619a45fd5e29fcec092fa` | 868.300 |
  | `large-20mib.json` | `929a3e78839add7479ae69018d6572f919aaf7e2a183fe92d9ef306c73f8775a` | 20.971.581 |
  | `workspace-10x100.json` | `55ab24b17daccac817711e9b04b529a09de9f3c6d10eaaed13c829c56a901608` | 1.338.440 |
- `scripts/bench/fixtures.test.mjs`: 6 testes verdes (determinismo, import real pelo `importDocument` com 1.000 operações, workspace aceito por `isWorkspace`/`normalizeWorkspace`, servidor, agregação do CSV).

## Pendências

- O amostrador é só para Windows. Linux e macOS precisariam de outra implementação (sem ambiente para validar).
