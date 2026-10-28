# TASK-003 — Baseline Electron (build de produção)

**Fase:** A

## Status

TODO

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

- [ ] Script de execução dos cenários
- [ ] Rodar 5 vezes cada cenário
- [ ] Gravar dados brutos
- [ ] Escrever o relatório

## Critérios de aceite

- [ ] Dados brutos em `docs/migration/bench-results/electron/`
- [ ] `BENCHMARKS.md` com ambiente, método, resultados e lacunas
- [ ] Nenhum número sem dado bruto correspondente

## Arquivos relacionados

- `scripts/bench/*`
- `docs/migration/bench-results/electron/*`
- `docs/migration/BENCHMARKS.md`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
