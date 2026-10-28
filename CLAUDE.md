# Reqora: instruções para sessões de agente

O Reqora é um cliente de API para desktop, uma alternativa ao Apidog **sem limite de projetos**. Está em andamento a migração de Electron para Tauri 2. O motivo é o consumo de RAM: o Apidog também é Electron e pesa demais.

## Procedimento de cada sessão

1. Ler este arquivo, depois `docs/migration/PROGRESS.md`, depois `docs/migration/TASKS.md`.
2. Escolher a próxima TASK cujo estado seja `TODO` e cujas dependências estejam todas `DONE`.
3. Marcar a TASK como `IN_PROGRESS` em `TASKS.md` e no arquivo `docs/migration/tasks/TASK-XXX.md`.
4. Implementar **só** o escopo da TASK. Qualquer descoberta fora do escopo vira uma TASK nova ou um item de backlog.
5. Validar e registrar as evidências reais (comandos, saídas, números) no arquivo da TASK.
6. Atualizar `TASKS.md`, `PROGRESS.md` e, quando houver decisão, `DECISIONS.md`.
7. Commit e push.

Estados: `TODO`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `DONE`. Uma TASK só fica `DONE` com todos os critérios de aceite cumpridos e evidenciados.

## Regras de commit

- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `perf:`).
- **Nunca** adicionar `Co-Authored-By` nem qualquer atribuição a Claude ou Anthropic.
- Commit só com `pnpm typecheck`, `pnpm test` e `pnpm build` verdes; `pnpm smoke:electron` verde quando o host Electron for afetado. A partir da Fase B, também `cargo test` e `cargo clippy -- -D warnings`.
- Commits pequenos, incrementais e reversíveis. Push a cada checkpoint. Sem force push e sem reescrever histórico.
- Nunca commitar segredos, `node_modules`, saída de build (`out/`, `src-tauri/target/`) ou código do Apidog.
- Se o push falhar, registrar e seguir.

## Regras da migração

- Não reescrever o que não precisa: o domínio em TypeScript (`src/search`, `src/importer`, `src/environments`, `src/runner`, `src/workspace`) continua em TS.
- Não mudar o formato dos dados em silêncio. Toda mudança tem migração de esquema e backup.
- Não remover testes. Testes de `src/main` são portados (ver o mapeamento no plano e na TASK-026).
- Não usar resultados hipotéticos como benchmark. Números só com medição reproduzível (`docs/migration/BENCHMARKS.md`).
- Se um teste depende de ambiente ou ferramenta indisponível, registrar a limitação e não declarar o cenário como validado.
- Não adicionar Electron nem outro runtime com Chromium ou Node embutido. Medir memória em vez de presumir.
- Nunca limitar o número de projetos. Dados (endpoints, ambientes, histórico de busca) são isolados por projeto.
- Remover o Electron só na TASK-026, depois de paridade funcional comprovada.
- Interpretador JavaScript embutido nunca é considerado seguro por padrão: limites de tempo, memória, permissões e recursos são obrigatórios.

## Comandos

```
pnpm typecheck
pnpm test             # vitest; maxWorkers=2 (ver vitest.config.ts)
pnpm build
pnpm smoke:electron   # cenários: search, import, environments, sending, projects
```

## Mapa

- `src/main`, `src/preload`: host Electron (será substituído por `src-tauri`).
- `src/renderer`: UI React. Acesso ao backend só por `workspaceClient.ts`, `importGateway.ts` e `requestGateway.ts`.
- `src/shared/api.ts`: contrato IPC (`ReqoraApi`).
- `docs/migration/`: gestão da migração (roadmap, tarefas, progresso, decisões, benchmarks).
