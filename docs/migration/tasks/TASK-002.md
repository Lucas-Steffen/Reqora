# TASK-002 — Harness de benchmark e fixtures

**Fase:** A

## Status

TODO

## Prioridade

Alta

## Dependências

TASK-001

## Objetivo

Ter um harness reproduzível que mede a árvore de processos inteira e fixtures determinísticas para os cenários.

## Escopo

- Amostrador PowerShell de longa duração a 100 ms seguindo `Win32_Process.ParentProcessId`
- Métricas: WorkingSet64, PrivateMemorySize64, Working Set – Private, CPU
- Geradores de fixtures com seed fixa e hash: OpenAPI de 1.000 endpoints, JSON de 20 MB, workspace com N projetos
- Servidor loopback para as respostas

## Subtarefas

- [ ] Escrever o amostrador
- [ ] Autoteste do amostrador contra uma árvore conhecida
- [ ] Escrever os geradores de fixtures
- [ ] Registrar os hashes
- [ ] Servidor loopback

## Critérios de aceite

- [ ] Autoteste do amostrador passa
- [ ] Gerar as fixtures duas vezes produz os mesmos hashes
- [ ] O amostrador não entra na árvore medida

## Arquivos relacionados

- `scripts/bench/*`
- `docs/migration/BENCHMARKS.md`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
