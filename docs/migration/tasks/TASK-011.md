# TASK-011 — Migração de segredos do Electron (DPAPI)

**Fase:** C

## Status

TODO

## Prioridade

Alta

## Dependências

TASK-010

## Objetivo

Abrir os segredos `v10` do Electron no Windows.

## Escopo

- DPAPI libera `os_crypt.encrypted_key` de `Local State`
- AES-GCM abre blobs `v10`
- Falha marca `hasStoredSecret: false` e nunca apaga

## Subtarefas

- [ ] Gerar vetor de teste com o Electron real
- [ ] Implementar
- [ ] Testar inclusive `secrets.json` ausente

## Critérios de aceite

- [ ] Fixture real decifrada
- [ ] Falha marca o segredo para redefinir e nunca apaga

## Arquivos relacionados

- `src-tauri/src/migrate/*`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
