# TASK-014 — Segurança da janela

**Fase:** C

## Status

TODO

## Prioridade

Alta

## Dependências

TASK-008

## Objetivo

Manter ou superar o isolamento atual do Electron.

## Escopo

- CSP
- Capabilities só na janela principal
- Navegação, novas janelas e permissões negadas
- Devtools fora do release
- Validação de payload (caminho ≤ 4096, URL ≤ 8192, forma do draft)

## Subtarefas

- [ ] Configuração
- [ ] Validações
- [ ] Testes

## Critérios de aceite

- [ ] Testes de capabilities e payload verdes

## Arquivos relacionados

- `src-tauri/capabilities/*`
- `src-tauri/tauri.conf.json`

## Resultado

_Pendente._

## Evidências de validação

_Pendente._

## Pendências

_Nenhuma registrada._
