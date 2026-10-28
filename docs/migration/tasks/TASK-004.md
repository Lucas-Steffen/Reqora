# TASK-004 — Preferências e histórico de busca no backend

**Fase:** A

## Status

DONE

## Prioridade

Média

## Dependências

TASK-003

## Objetivo

Tirar preferências e histórico de busca do localStorage (perfil Chromium) e gravá-los em `preferences.json` no backend, para que sobrevivam à troca de host.

## Escopo

- Contrato `preferences` em `src/shared/api.ts`
- Store de preferências no main com escrita atômica
- Migração única das chaves `reqora.search.*` do localStorage, mantidas como backup
- Histórico por projeto preservado

## Subtarefas

- [x] Contrato e store
- [x] Migração do localStorage
- [x] Testes novos
- [x] Smoke de search e projects

## Critérios de aceite

- [x] Testes novos e antigos verdes
- [x] Smoke de search e projects verde
- [x] Histórico por projeto preservado após a migração
- [x] Chaves antigas continuam no localStorage

## Arquivos relacionados

- `src/renderer/src/preferences.ts`
- `src/shared/api.ts`
- `src/main/*`
- `src/preload/index.ts`

## Resultado

- **Contrato.** `ReqoraApi.preferences` (opcional) com `load()` → `{initialized, values}` e `save(values)`; canais `reqora:preferences:load` e `reqora:preferences:save`, protegidos por `guarded(isTrustedUrl)` como os demais.
- **Store** (`src/main/preferencesStore.ts`): `preferences.json` em `userData` no formato `{version: 1, values}`.
  - Escrita atômica (arquivo temporário + rename) e serializada.
  - Só aceita chaves `reqora.*` com até 512 caracteres e valores string; o arquivo tem no máximo 1 MiB.
  - Arquivo ilegível ou de versão desconhecida é movido para `.corrupt-<ms>` e o store recomeça vazio, sem adivinhar o formato.
- **Renderer** (`src/renderer/src/preferences.ts`):
  - `initPreferences()` carrega o backend antes do primeiro render (`main.tsx`).
  - Na primeira execução (`initialized: false`), as chaves `reqora.*` do localStorage são copiadas uma vez para o backend; as originais ficam onde estão, como backup.
  - Depois disso, leitura e escrita usam só o cache do backend; gravações em rajada são agrupadas e enviam o estado mais recente.
  - Se o backend falhar ou não existir (navegador, testes), o comportamento antigo com localStorage continua.
  - A migração do histórico global legado para o histórico por projeto passa a acontecer dentro do backend.
- **Formato.** O conteúdo das chaves (histórico por projeto, filtros) não mudou; só o lugar onde fica.

## Evidências de validação

- `pnpm typecheck`: verde.
- `pnpm test`: 15 arquivos, 151 testes verdes (140 anteriores + 11 novos: 5 em `src/main/preferences.main.test.ts`, 6 em `src/renderer/src/preferences.test.ts`).
  - Os testes novos cobrem: importação única com as chaves antigas mantidas, leitura só do backend após inicializar, gravação e remoção agrupadas, migração do histórico global legado, fallback para o localStorage, rejeição de chaves estranhas e de payload grande, `.corrupt-*` e versão desconhecida.
- `pnpm build`: verde.
- `pnpm smoke:electron`: 5 de 5 cenários com `"outcome": "passed"` (search, import, environments, sending, projects). O cenário search confere "Recent query survives a renderer reload" e "Blank-query metadata filtering … survives reload", agora passando pelo backend.

## Pendências

- Um perfil Electron já existente só migra as preferências na próxima abertura deste build; isso não foi exercitado sobre a cópia real de `%APPDATA%\reqora` (o teste unitário cobre a lógica).
- O Tauri copia `preferences.json` na TASK-009, junto com o workspace.
