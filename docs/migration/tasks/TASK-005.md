# TASK-005 — Toolchain Rust e MSVC

**Fase:** B

## Status

BLOCKED

## Prioridade

Alta

## Dependências

TASK-004

## Objetivo

Instalar rustup (`stable-msvc`) e Visual Studio Build Tools com C++ via winget (autorizado pelo usuário).

## Escopo

- rustup e toolchain `stable-msvc`
- VS Build Tools com o workload de C++

## Subtarefas

- [ ] Instalar via winget (rustup instalado; Build Tools cancelado no UAC)
- [ ] Verificar `rustc`, `cargo`, `link.exe` (`rustc` e `cargo` ok; `link.exe` ausente)
- [x] Registrar versões

## Critérios de aceite

- [ ] `rustc`, `cargo` e `link.exe` funcionando
- [ ] Versões registradas em PROGRESS

## Arquivos relacionados

- `docs/migration/PROGRESS.md`

## Resultado

- **Rust instalado:** rustup 1.29.1 (d95a37b6a 2026-08-13), rustc 1.99.1 (58cf8f9c3 2026-10-13), cargo 1.99.1 (5f94df478 2026-08-27), toolchain padrão `stable-x86_64-pc-windows-msvc`.
- **VS Build Tools 2022 (17.14.42) não instalado.** O winget baixou e verificou o instalador, mas ele terminou com o código **1602** (instalação cancelada pelo usuário): o prompt do UAC foi negado ou fechado. Sem `link.exe`, o Rust MSVC não consegue linkar nada.
- Status **BLOCKED** até o Build Tools ser instalado com elevação.

## Evidências de validação

- `winget install Microsoft.VisualStudio.2022.BuildTools` (com o workload `Microsoft.VisualStudio.Workload.VCTools`): "Hash do instalador verificado com êxito" seguido de "O instalador falhou com o código de saída: 1602"; winget saiu com 6.
- `vswhere.exe` não existe; nenhum `link.exe` em `VCToolsMSVC*inHostx64d`.

## Pendências

- Instalar o Build Tools aprovando o UAC (comando no PROGRESS) e então validar um `cargo build` de hello-world.
