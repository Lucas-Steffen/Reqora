# Pesquisa de stacks

Pesquisa feita em 2026-10 para escolher a stack-alvo. **Números de terceiros são hipóteses, não prova.** A decisão sai das medições deste repositório (TASK-007 e TASK-017). Itens marcados **NÃO VERIFICADO** não foram confirmados na documentação oficial.

## Comparação

| | Tauri 2 (2.12) | Qt 6 (6.12 LTS) | Avalonia 12 |
|---|---|---|---|
| Reaproveita React/TS e o domínio testado | Sim, integralmente | Não: UI reescrita em QML/C++ | Não: UI reescrita em XAML/C# |
| Motor de UI | WebView do SO (WebView2 no Windows, WebKitGTK 4.1 no Linux, WKWebView no macOS) | Renderização própria | Renderização própria (Skia) |
| Editor de código | CodeMirror 6 | KSyntaxHighlighting (MIT); sem editor do porte do Monaco | AvaloniaEdit 12 (MIT) |
| Listas grandes | Virtualização no React | TableView/TreeView reciclam delegates | TreeDataGrid virou comercial (Pro) |
| JS embutido para scripts | rquickjs: limite de memória e interrupção | QJSEngine: interrupção, sem limite de memória | Jint `ForUntrustedCode`: tempo, instruções e memória, mas não é fronteira de segurança do SO |
| Licença | MIT/Apache-2.0 | LGPLv3 com obrigações; módulos só GPL; LTS imediata só na comercial | MIT no núcleo |

## Referência: Yaak

Cliente de API open source (MIT) na mesma stack proposta: Tauri, React, reqwest 0.13, rusqlite com r2d2 e keyring. Os plugins rodam num sidecar Node.js; não há números oficiais de RAM. Teve um vazamento ocioso de cerca de 9 GB no Linux, causado por um watcher de Git e corrigido na 2026.5.0. **Lição:** o risco de memória está em watchers e sidecars, não no shell.

## Números publicados (não são prova)

| Fonte | Electron | Tauri | Ressalvas |
|---|---|---|---|
| Elanis, app vazio, Windows | ~279 MB | ~307 MB | Versões e data não informadas |
| Elanis, app vazio, Linux | ~589 MB | ~94 MB | Idem |
| quota-ops PR #35, Windows, memória privada ociosa da árvore | 334,8 MB (5 processos) | 299,0 MB (9 processos) | O Tauri inclui um sidecar Node de 100,7 MB; os 6 processos WebView2 somam 191,8 MB. Inicialização: 523 ms × 1.135 ms. Binário: 368,5 MB × 2,94 MB. Um único desenvolvedor; os dois builds rodam sidecar Node |

## Implicações

- **No Windows a economia ociosa pode ser pequena.** O WebView2 é Chromium e também abre processos de browser, renderer, GPU e utility. Os ganhos claros estão no Linux e no tamanho do instalador.
- **A economia real vem da arquitetura:** HTTP, arquivos e segredos fora do heap JS; nenhum sidecar Node; respostas grandes fora do estado React.
- **Medição:** os `msedgewebview2.exe` rodam a partir de Program Files, então filtrar pelo caminho do executável subconta. Seguir a árvore de PIDs. Somar working sets conta páginas compartilhadas duas vezes; reportar a memória privada à parte.
- **Ajustes do WebView2:** a Microsoft recomenda `MemoryUsageTargetLevel = Low` e `TrySuspendAsync` em segundo plano, mantendo a GPU ligada. **NÃO VERIFICADO:** se o wry expõe esse ajuste; alternativa: acessar o controlador por `with_webview`.

## Detalhes do Tauri que afetam o plano

- **IPC:** eventos só levam JSON e não servem para volume. Bytes vão por `tauri::ipc::Response` ou `Channel<InvokeResponseBody>` Raw, que chegam como `ArrayBuffer`. `Channel<Vec<u8>>` vira array JSON.
- **Origem:** no Windows é `http://tauri.localhost`; mudar `useHttpsScheme` move localStorage e IndexedDB. Reforça a TASK-004.
- **Segredos:** o Stronghold "não é mais recomendado" e não há plugin oficial de keyring; usar a crate `keyring` diretamente.
- **Instalador:** NSIS com WebView2 em `downloadBootstrapper` (padrão). Offline (~127 MB) e fixo (~180 MB) como opção. MSI exigiria WiX v3 e VBSCRIPT.
- **Updater:** exige chave de assinatura própria (`TAURI_SIGNING_PRIVATE_KEY`); vai para o backlog.
- **E2E:** `tauri-driver` exige `msedgedriver` da mesma versão do WebView2; o plano usa CDP.
- **Pré-requisitos no Windows:** MSVC "Desktop development with C++" e `rustup default stable-msvc`.

## Crates

- **reqwest 0.13:** o TLS padrão passou a ser rustls com aws-lc. O limite padrão de redirecionamentos é 10; o Reqora usa 20 (`Policy::limited(20)`). Escolha rustls × native-tls num ADR na TASK-012.
- **keyring 4.2:** `keyring-core` com store nativo do Windows, ou a feature `v1` com a API antiga.
- **rusqlite 0.41:** fora até haver necessidade (TASK-023).
- **rquickjs 0.14 (backlog):** `set_memory_limit` não faz nada com as features `rust-alloc` ou `allocator`, que ficam desligadas. O interrupt handler gera exceção não capturável. A pilha padrão é de 256 KiB. Um interpretador embutido nunca é considerado seguro por padrão.

## Editor: Monaco × CodeMirror 6

Sourcegraph e Replit migraram de Monaco para CodeMirror 6 citando tamanho de bundle e carga. O Monaco é pesado e pensado para um editor por página. Decisão provisória: CodeMirror 6 sob demanda (TASK-022), com a comparação medida registrada lá.

## Fontes

**Yaak**
- https://yaak.app/feedback/posts/yaak-uses-excessive-memory-and-cpu-while-idle-possible-memory-leak
- https://yaak.app/docs/plugin-development/plugins-quick-start
- https://github.com/mountain-loop/yaak
- https://archlinux.org/packages/extra/x86_64/yaak/files/

**Qt**
- https://www.qt.io/licensing/open-source-lgpl-obligations
- https://wiki.qt.io/Qt_6.12_Release
- https://doc.qt.io/qt-6/qsyntaxhighlighter.html
- https://doc.qt.io/qt-6/qml-qtquick-tableview.html
- https://doc.qt.io/qt-6/qjsengine.html
- https://doc.qt.io/qt-6/licensing.html
- https://doc.qt.io/qt-6.12/qt-releases.html

**Tauri**
- https://v2.tauri.app/start/prerequisites/
- https://v2.tauri.app/security/csp/
- https://v2.tauri.app/security/capabilities/
- https://v2.tauri.app/reference/config/
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/plugin/sql/
- https://v2.tauri.app/plugin/http-client/
- https://v2.tauri.app/distribute/windows-installer/
- https://v2.tauri.app/distribute/debian/
- https://v2.tauri.app/distribute/appimage/
- https://v2.tauri.app/develop/tests/webdriver/
- https://v2.tauri.app/develop/calling-rust/
- https://v2.tauri.app/develop/calling-frontend/
- https://github.com/tauri-apps/plugins-workspace
- https://github.com/orgs/tauri-apps/discussions/7846
- https://docs.rs/tauri/latest/tauri/ipc/struct.Response.html
- https://docs.rs/tauri/latest/tauri/ipc/struct.Channel.html
- https://crates.io/api/v1/crates/tauri

**Editores**
- https://sourcegraph.com/blog/migrating-monaco-codemirror
- https://registry.npmjs.org/monaco-editor/latest
- https://github.com/microsoft/monaco-editor
- https://blog.repl.it/codemirror
- https://invent.kde.org/frameworks/syntax-highlighting/-/raw/master/README.md

**Crates Rust**
- https://raw.githubusercontent.com/seanmonstar/reqwest/master/CHANGELOG.md
- https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html
- https://raw.githubusercontent.com/rusqlite/rusqlite/master/README.md
- https://github.com/open-source-cooperative/keyring-rs
- https://docs.rs/keyring/latest/keyring/
- https://docs.rs/rquickjs/latest/rquickjs/struct.Runtime.html

**WebView2**
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance

**Avalonia e Jint**
- https://github.com/sebastienros/jint
- https://github.com/AvaloniaUI/AvaloniaEdit
- https://github.com/AvaloniaUI/Avalonia/discussions/19804
- https://docs.avaloniaui.net/docs/deployment/native-aot
- https://docs.avaloniaui.net/controls/data-display/structured-data/treedatagrid

**Benchmarks de terceiros**
- https://github.com/Elanis/web-to-desktop-framework-comparison
- https://github.com/ChrisLeoKokotos/quota-ops/pull/35
