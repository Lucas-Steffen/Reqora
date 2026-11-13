# TASK-005 — Toolchain Rust e MSVC

**Fase:** B

## Status

DONE

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

- [x] Instalar via winget
- [x] Verificar `rustc`, `cargo`, `link.exe`
- [x] Registrar versões

## Critérios de aceite

- [x] `rustc`, `cargo` e `link.exe` funcionando
- [x] Versões registradas em PROGRESS

## Arquivos relacionados

- `docs/migration/PROGRESS.md`

## Resultado

- **Rust:** rustup 1.29.1 (d95a37b6a 2026-08-13), rustc 1.99.1 (58cf8f9c3 2026-10-13), cargo 1.99.1 (5f94df478 2026-08-27), toolchain padrão `stable-x86_64-pc-windows-msvc`.
- **VS Build Tools 2022:** 17.14.37806.7, workload `Microsoft.VisualStudio.Workload.VCTools` com os componentes recomendados; MSVC 14.44.35207.
- **Instalação do Build Tools:** as três tentativas feitas pelo agente terminaram com 1602, porque o prompt do UAC não chegou a ser aprovado (num processo em segundo plano com `--quiet` e numa aba visível do terminal com `--passive`). O usuário então instalou com o mesmo comando num terminal de administrador.

## Evidências de validação

- `vswhere.exe -products *`: "Ferramentas de Build do Visual Studio 2022", `installationVersion: 17.14.37806.7`, em `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`.
- `link.exe` em `VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe`.
- `cargo new hello` + `cargo build` no scratchpad compilou e linkou; `target\debug\hello.exe` imprimiu "Hello, world!".

## Pendências

Nenhuma.
