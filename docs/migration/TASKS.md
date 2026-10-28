# TASKs

Estados: `TODO`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `DONE`. Uma TASK só fica `DONE` com todos os critérios de aceite cumpridos e evidenciados no arquivo dela.

| TASK | Fase | Título | Prioridade | Dependências | Estado |
|---|---|---|---|---|---|
| [TASK-001](tasks/TASK-001.md) | A | Estrutura de gestão, auditoria, pesquisa e ADRs iniciais | Alta | — | DONE |
| [TASK-002](tasks/TASK-002.md) | A | Harness de benchmark e fixtures | Alta | TASK-001 | TODO |
| [TASK-003](tasks/TASK-003.md) | A | Baseline Electron (build de produção) | Alta | TASK-002 | TODO |
| [TASK-004](tasks/TASK-004.md) | A | Preferências e histórico de busca no backend | Média | TASK-003 | TODO |
| [TASK-005](tasks/TASK-005.md) | B | Toolchain Rust e MSVC | Alta | TASK-004 | TODO |
| [TASK-006](tasks/TASK-006.md) | B | Scaffold de src-tauri | Alta | TASK-005 | TODO |
| [TASK-007](tasks/TASK-007.md) | B | Gate de memória e ADR de go/no-go | Crítica | TASK-003, TASK-006 | TODO |
| [TASK-008](tasks/TASK-008.md) | C | Camada IPC tipada (platform/) | Alta | TASK-007 | TODO |
| [TASK-009](tasks/TASK-009.md) | C | Store de workspace em Rust | Alta | TASK-008 | TODO |
| [TASK-010](tasks/TASK-010.md) | C | Cofre de segredos | Alta | TASK-009 | TODO |
| [TASK-011](tasks/TASK-011.md) | C | Migração de segredos do Electron (DPAPI) | Alta | TASK-010 | TODO |
| [TASK-012](tasks/TASK-012.md) | C | Envio HTTP com reqwest | Alta | TASK-010 | TODO |
| [TASK-013](tasks/TASK-013.md) | C | Import em Rust + Web Worker | Alta | TASK-008 | TODO |
| [TASK-014](tasks/TASK-014.md) | C | Segurança da janela | Alta | TASK-008 | TODO |
| [TASK-015](tasks/TASK-015.md) | C | Smoke Tauri via CDP | Alta | TASK-009 a TASK-014 | TODO |
| [TASK-016](tasks/TASK-016.md) | C | Instalador NSIS | Média | TASK-015 | TODO |
| [TASK-017](tasks/TASK-017.md) | D | Benchmarks do Tauri | Alta | TASK-015, TASK-016 | TODO |
| [TASK-018](tasks/TASK-018.md) | D | Visualizador de respostas grandes | Média | TASK-012 | TODO |
| [TASK-019](tasks/TASK-019.md) | D | Busca incremental | Média | TASK-008 | TODO |
| [TASK-020](tasks/TASK-020.md) | D | Virtualização da árvore e resultados | Média | TASK-021 | TODO |
| [TASK-021](tasks/TASK-021.md) | D | Dividir App.tsx e store de seletores | Média | TASK-008 | TODO |
| [TASK-022](tasks/TASK-022.md) | D | CodeMirror 6 sob demanda | Baixa | TASK-021 | TODO |
| [TASK-023](tasks/TASK-023.md) | D | ADR de armazenamento (JSON × SQLite) | Média | TASK-017 | TODO |
| [TASK-024](tasks/TASK-024.md) | D | Teste de vazamento | Média | TASK-017 | TODO |
| [TASK-025](tasks/TASK-025.md) | D | Polimento de UI | Baixa | TASK-021 | TODO |
| [TASK-026](tasks/TASK-026.md) | E | Remoção do Electron | Alta | TASK-001 a TASK-025 | TODO |

## Backlog (fora do escopo da migração)

- Sandbox de scripts com rquickjs: limites de memória e tempo (interrupt handler), sem arquivos nem rede por padrão; nunca considerado seguro por padrão.
- Múltiplas abas de requisição.
- Updater e assinatura de código.
- Migração de segredos no macOS e no Linux.
- Proxy do sistema.
- Autenticação (feature 4).
