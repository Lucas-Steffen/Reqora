# TASK-006 — Scaffold de src-tauri

**Fase:** B

## Status

DONE

## Prioridade

Alta

## Dependências

TASK-005

## Objetivo

Criar o projeto Tauri que carrega a UI atual, sem tocar no Electron.

## Escopo

- `src-tauri` reaproveitando `vite.renderer.config.ts` (dev em 127.0.0.1:5173, saída `out/renderer`)
- CSP e capabilities mínimas
- Adapter `memory` para rodar sem backend

## Subtarefas

- [x] Scaffold
- [x] Configuração de CSP e capabilities
- [x] Adapter memory (adiantado: é só TypeScript e não depende do toolchain)
- [x] Build release

## Critérios de aceite

- [x] `tauri dev` e `tauri build` (release) abrem a UI
- [x] Electron intacto
- [x] Testes TS verdes

## Arquivos relacionados

- `src-tauri/*`
- `src/renderer/src/platform/*`

## Resultado

- `src-tauri/` (commit 60b9351): crate `reqora` com lib `reqora_lib`, `main.rs` só chama `run()`, nenhum command ainda. Perfil release com `lto`, `codegen-units=1`, `opt-level="s"`, `panic="abort"` e `strip`.
- `tauri.conf.json`: identificador `com.reqora.app`, janela `main` 1440×960 (mínimo 1000×700), fundo `#101116`, `withGlobalTauri: false`, instalador NSIS.
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost`. Em dev, `devCsp` acrescenta só `ws://127.0.0.1:*` e `ws://localhost:*` para o HMR do Vite.
- Capabilities: `capabilities/main.json` concede só `core:default`, e só à janela `main`.
- Sem backend, a UI roda no adapter `memory` com o workspace de exemplo.

**Desvio do escopo:** o build do renderer para o Tauri sai em `out/tauri-renderer` (script `build:tauri-renderer`), não em `out/renderer`. O motivo é que `vite.renderer.config.ts` usa `emptyOutDir: true`, e gravar em `out/renderer` apagaria a saída do electron-vite. O dev continua em 127.0.0.1:5173 com o mesmo config.

## Evidências de validação

Máquina: i5-10400F, Windows 11 26200, rustc 1.99.1 (stable-x86_64-pc-windows-msvc), MSVC 14.44.35207. Crates resolvidas: tauri 2.12.5, wry 0.57.1, tao 0.37.2, webview2-com 0.39.1.

| Verificação | Resultado |
|---|---|
| `cargo build` (dev, primeira compilação) | OK em 3m51s |
| `cargo test` | ok, 0 testes (ainda não há código próprio) |
| `cargo clippy -- -D warnings` | sem avisos |
| `pnpm tauri build` | OK; perfil release em 3m24s |
| `src-tauri/target/release/reqora.exe` | 3.210.240 bytes (3,1 MiB) |
| `bundle/nsis/Reqora_0.1.0_x64-setup.exe` | 1.236.155 bytes (1,18 MiB); NSIS 3.13 e `nsis_tauri_utils` 0.5.3 baixados pelo CLI com hash conferido |
| Executável release | Janela "Reqora" 1456×999 com filho `msedgewebview2.exe`; a captura mostra a UI completa (sidebar, coleção de exemplo, busca, preview) |
| `pnpm tauri dev` | Vite em 127.0.0.1:5173 + `target/debug/reqora.exe`; janela "Reqora" com a mesma UI |
| `pnpm typecheck` | verde |
| `pnpm test` | 16 arquivos, 155 testes verdes |
| `pnpm build` | verde |
| `pnpm smoke:electron` | 5 cenários verdes (Electron intacto) |

**Observação, sem causa confirmada:** a primeira execução do `reqora.exe` release fechou sozinha em menos de 8 s, sem janela capturável. As 4 execuções seguintes ficaram abertas. Uma hipótese, não verificada, é a criação do perfil WebView2 na primeira execução. Fica para a TASK-016 (instalação limpa) reproduzir com o perfil apagado.

## Pendências

- Reproduzir o fechamento na primeira execução (TASK-016).
- Instalador sem assinatura de código (backlog).
