# TASK-003 — Baseline Electron (build de produção)

**Fase:** A

## Status

DONE

## Prioridade

Alta

## Dependências

TASK-002

## Objetivo

Medir o Electron atual em 8 cenários × 5 execuções para ter a referência de comparação.

## Escopo

- Build de produção
- Cenários: inicialização, ocioso 60 s, import de 1.000 endpoints, busca, 10 endpoints em sequência, resposta de 20 MB, troca de projeto, uso contínuo
- Inicialização e ocioso sem automação
- Mediana, mínimo e máximo; residente e privada separadas

## Subtarefas

- [x] Script de execução dos cenários (`scripts/bench/electron.mjs`, `pnpm bench:electron`)
- [x] Rodar 5 vezes cada cenário
- [x] Gravar dados brutos
- [x] Escrever o relatório (`scripts/bench/report.mjs` gera as tabelas)

## Critérios de aceite

- [x] Dados brutos em `docs/migration/bench-results/electron/`
- [x] `BENCHMARKS.md` com ambiente, método, resultados e lacunas
- [x] Nenhum número sem dado bruto correspondente

## Arquivos relacionados

- `scripts/bench/electron.mjs`, `scripts/bench/report.mjs`
- `docs/migration/bench-results/electron/*`
- `docs/migration/BENCHMARKS.md`

## Resultado

- **Execuções:** 35 de 35 válidas.
- **Agrupamento de cenários:**
  - Inicialização e ocioso são um único cenário sem automação, com 65 s de amostragem: T+5 s mais a janela ociosa.
  - Os outros 6 cenários usam Playwright.
  - Os 8 cenários do plano estão cobertos.
- **Números principais**, em mediana (mín–máx) de memória privada da árvore:

| Cenário | Valor |
|---|---|
| T+5 s | 232 (232–235) MiB, 4 processos |
| Fim do ocioso | 217 (216–220) MiB |
| Pico com a resposta grande | 1.167 (1.166–1.172) MiB |
| Pico no uso contínuo (20 iterações) | 2.008 (1.921–2.207) MiB |
| Inclinação na segunda metade do uso contínuo | cerca de 33 MiB por iteração |

As tabelas completas estão em [BENCHMARKS.md](../BENCHMARKS.md#baseline-electron-task-003).

## Evidências de validação

- **Rodada.** `pnpm build` seguido de `pnpm bench:electron`, de 2026-10-28T08:46:28Z a 09:07:42Z.
- **Log.** Mostra "ok" em todas as 35 execuções. O lançamento de aquecimento ficou pronto em 6.694 ms.
- **Servidor loopback.** Recebeu 105 requisições em `/bench/large-json`: 5 do cenário de resposta grande mais 100 do uso contínuo (5 × 20).
- **Saída.** O `summary.json` registra o SHA-256 de cada fixture, igual ao de `fixtures.sha256.json`.

## Pendências

- **Rodada interrompida.** Uma rodada anterior foi interrompida em open-10, na execução 4, quando a sessão terminou. Os dados dela foram descartados e a rodada foi refeita do zero.
- **Crescimento no uso contínuo.** A memória privada cresce sem estabilizar. A causa fica para a TASK-018 (respostas grandes) e a TASK-024 (vazamento).
- **Tempo de inicialização.** Sem automação não há marcador de UI pronta. O `readyMs` é medido com Playwright.
- **Outros sistemas.** Linux e macOS não foram medidos.
