# TASK-010 — Cofre de segredos

**Fase:** C

## Status

TODO

## Prioridade

Alta

## Dependências

TASK-009

## Objetivo

Chave-mestra no keyring do SO e `secrets.v2.json` com AES-256-GCM.

## Escopo

- keyring 4.2
- AES-256-GCM com nonce único por valor
- Regras atuais: extração de todos os projetos, `copySecretFrom`, `retainOnly`, `reveal` restrito
- `secrets.json` legado nunca sobrescrito

## Subtarefas

- [ ] Cofre
- [ ] Comandos
- [ ] Portar testes com keyring em memória

## Critérios de aceite

- [ ] Testes de segredos portados e verdes
- [ ] Mensagem de keyring indisponível idêntica à atual

## Arquivos relacionados

- `src-tauri/src/secrets/*`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
