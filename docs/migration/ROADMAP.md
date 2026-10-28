# Roadmap

## Fase A — Preparação e baseline (Electron; arquitetura intacta)

TASK-001 a TASK-004. Documentação de gestão, harness de benchmark, baseline Electron medido e preferências movidas para o backend.

**Marco:** baseline Electron com números reais em `BENCHMARKS.md`.

## Fase B — Protótipo Tauri

TASK-005 a TASK-007. Toolchain Rust e MSVC, scaffold de `src-tauri` com a UI atual, e o **gate de memória**.

**Marco:** ADR de go/no-go com números reais. Go se a memória privada da árvore de processos do Tauri ficar abaixo da do Electron sem sobreposição entre os intervalos mín–máx de 5 execuções. Caso contrário: ajustes do WebView2 (`MemoryUsageTargetLevel`, `TrySuspendAsync`, processo de GPU) e, se ainda empatar, a decisão volta ao usuário antes de qualquer protótipo em Qt ou Avalonia.

## Fase C — Backend Rust com paridade

TASK-008 a TASK-016. Adapter IPC tipado, store de workspace, cofre de segredos, migração de segredos via DPAPI, envio HTTP com reqwest, import em Rust + Web Worker, segurança da janela, smoke Tauri via CDP e instalador NSIS.

**Marco:** os 5 cenários de smoke verdes nos dois hosts.

## Fase D — Testes e otimização

TASK-017 a TASK-025. Benchmarks comparativos, visualizador de respostas grandes, busca incremental, virtualização, divisão do `App.tsx`, CodeMirror 6 sob demanda, ADR de armazenamento, teste de vazamento e polimento de UI.

**Marco:** comparação medida Electron × Tauri em todos os cenários.

## Fase E — Remoção do Electron

TASK-026. Checklist de paridade, mapeamento teste a teste, remoção de `electron`, `electron-vite`, `src/main` e `src/preload`, README e relatório final.

**Marco:** Reqora 100% Tauri, sem regressão funcional.

## Limitações conhecidas

- Só há Windows disponível. WebKitGTK (Linux) e WKWebView (macOS) não serão validados.
- Não há certificado de assinatura de código.
