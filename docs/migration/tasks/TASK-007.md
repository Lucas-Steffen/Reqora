# TASK-007 — Gate de memória e ADR de go/no-go

**Fase:** B

## Status

TODO

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

- [ ] Medir 5 execuções
- [ ] Comparar
- [ ] Testar `MemoryUsageTargetLevel=Low`, `TrySuspendAsync` e GPU se necessário
- [ ] Escrever o ADR

## Critérios de aceite

- [ ] ADR com números reais
- [ ] Go somente se a memória privada da árvore ficar abaixo da do Electron sem sobreposição dos intervalos mín–máx
- [ ] Em empate persistente, decisão devolvida ao usuário

## Arquivos relacionados

- `docs/migration/DECISIONS.md`
- `docs/migration/BENCHMARKS.md`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
