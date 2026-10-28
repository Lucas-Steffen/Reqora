# Diagnóstico do código atual

Base: commit `065322e` (branch `main`), Electron 44.8, React 19.3, TypeScript 5.9, Tailwind 4.3, Vite 7.3, electron-vite 6.

## Visão geral

- **Dependências de runtime:** só `react`, `react-dom`, `lucide-react` e `yaml`. Não há editor pesado: o corpo da requisição é um `<textarea>` e a resposta um `<pre>`. Quase toda a RAM vai para o runtime Electron (Chromium, Node no processo principal, renderer, GPU e utility).
- **Segurança já boa:** `contextIsolation` e `sandbox` ativos; o preload (`src/preload/index.ts`) expõe uma interface pequena em `window.reqora`; `guarded()` em `src/main/ipc.ts` confere que o emissor é o frame principal com URL confiável; navegação, `window.open` e permissões são negadas.

## O que depende de Electron

| Área | Arquivos | Depende de Electron/Node? | Destino |
|---|---|---|---|
| Busca | `src/search/*` | Não | Fica em TS |
| Importador (parse, `$ref` com loader injetado, conversão, merge/overwrite) | `src/importer/*` | Não | Fica em TS, num Web Worker |
| Ambientes e variáveis | `src/environments/*` | Não | Fica em TS |
| Runner (`prepare`, `baseUrl`, `run` com dependências injetadas) | `src/runner/*` | Não | Fica em TS |
| Modelo, projetos, migração v1→v2, records | `src/workspace/*` | Não | Fica em TS |
| Contrato IPC | `src/shared/api.ts` | Não | Continua sendo a fronteira |
| Janela, CSP, navegação | `src/main/index.ts` | Sim | Configuração Tauri + Rust |
| IPC com verificação do emissor | `src/main/ipc.ts` | Sim | Commands + capabilities |
| Arquivo atômico, revisões, backup, `.corrupt-*` | `src/main/workspaceStore.ts` | Sim | Rust |
| Segredos (`safeStorage` → `secrets.json`) | `src/main/secretStore.ts`, `secretVariables.ts` | Sim | Rust (keyring + AES-GCM) |
| Envio HTTP | `src/main/http/sendRequest.ts` | Sim | Rust (reqwest) |
| IO do import | `src/main/importService.ts`, `http/boundedFetch.ts` | Sim | Rust lê bytes; pipeline em TS |
| Preload (`webUtils.getPathForFile`) | `src/preload/index.ts` | Sim | Adapter + drag-drop do Tauri |
| Únicas chamadas a `window.reqora` | `workspaceClient.ts:20`, `importGateway.ts:61`, `requestGateway.ts:39` | Ponto de troca | Seletor de adapter |
| Preferências e histórico de busca | `src/renderer/src/preferences.ts` (localStorage) | Indireto (perfil Chromium) | Arquivo no backend (TASK-004) |
| Smoke | `scripts/smoke-electron.mjs`, `scripts/smoke/*.mjs` | Sim | CDP no WebView2 |

**Conclusão:** o domínio inteiro é TypeScript puro e testado. O que é Electron está isolado em `src/main`, no preload e em 3 gateways. Uma reescrita completa não se justifica; basta trocar o host e a camada de IO.

## Limites atuais (a preservar)

- Workspace: escrita atômica, 64 MiB (`MAX_WORKSPACE_BYTES`), revisão com `StaleRevision`, `workspace.v{N}.backup.json`, `.corrupt-<ms>`, schema v2.
- Envio HTTP: 30 s, 10 MiB, 20 redirecionamentos.
- Import por URL (`boundedFetch`): 10 s, 5 MiB, 5 redirecionamentos.

## Onde vai a memória e o que bloqueia a UI

1. **Resposta copiada várias vezes.** `sendRequest.ts` junta os chunks numa string de até 10 MB; a string é clonada pelo IPC; `RequestPanel.tsx` guarda o `RunResult` inteiro em `useState`; `formatBody` roda `JSON.parse` + `stringify` a cada render; o `<pre>` recebe o texto completo.
2. **Busca.** `createMemorySearchRepository` (`src/search/repository.ts`) faz `structuredClone` em `getAll`, `search` e `replaceRecords`. O efeito em `App.tsx:236-251` reconstrói os registros de todos os projetos a cada mudança do workspace, em duas instâncias.
3. **`toSearchRecords`** (`src/workspace/records.ts`) é O(pastas × endpoints), e `folderChain` cria um `Map` novo por item.
4. **Árvore não virtualizada** (`renderTreeItem`, ~`App.tsx:458`): milhares de nós no DOM com 1.000 endpoints.
5. **`App.tsx` monolítico:** ~1.337 linhas, 25 `useState`; qualquer mudança re-renderiza a tela inteira.
6. **Cada save regrava tudo:** o workspace inteiro é serializado, passa pelo IPC e é regravado. O custo cresce com o número de projetos (ilimitado).
7. **Import no processo principal:** YAML de até 5 MB lido ali.

O spec pede um cenário de "10 abas", mas o app não tem abas de requisição: `activeTab` só alterna overview, example e request.

## Dados nesta máquina

`%APPDATA%\reqora` contém `workspace.json` (94 KB, versão 2), `Local State` e `Local Storage` (preferências de busca). Não há `secrets.json`, mas a migração precisa suportá-lo.

## Testes existentes

- 12 arquivos vitest, 134 testes (incluindo `src/main/*.main.test.ts`).
- Smoke Electron com 5 cenários: search, import, environments, sending, projects.
- Destino de cada teste de `src/main` na migração: ver o plano da Fase C em [TASKS.md](TASKS.md) e a TASK-026.
