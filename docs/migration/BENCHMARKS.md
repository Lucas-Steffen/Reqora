# Benchmarks

Nenhum número entra aqui sem dado bruto correspondente em `bench-results/`. Números de terceiros ficam em [research.md](research.md) e não são prova.

## Ambiente

| Item | Valor |
|---|---|
| CPU | Intel i5-10400F |
| RAM | 15,9 GB |
| SO | Windows 11 Pro 26200 |
| WebView2 Runtime | 156.0.4314.50 |
| Electron | 44.8 |

A carga da máquina no momento de cada medição (memória livre, outros apps abertos) é registrada junto com os dados brutos.

## Método

- **Builds de produção**, sempre na mesma máquina.
- **Árvore de processos inteira.** Um amostrador PowerShell de longa duração (`scripts/bench/sampler.ps1`) tira um snapshot Toolhelp32 a cada 100 ms e segue o PID pai (`th32ParentProcessID`, o mesmo valor de `Win32_Process.ParentProcessId`) a partir do PID raiz. Isso inclui os processos de renderer, GPU e utility do Electron e os `msedgewebview2.exe` do Tauri. O amostrador fica fora da árvore medida, e um filho só entra se foi criado depois do pai (proteção contra PID reutilizado).
  - *Desvio do plano:* o plano previa consultar `Win32_Process` (WMI). Toolhelp32 dá o mesmo PID pai sem uma consulta WMI de ~100 ms por tick.
  - A memória vem de `K32GetProcessMemoryInfo` (`PROCESS_MEMORY_COUNTERS_EX2`); a CPU, de `GetProcessTimes`.
  - Autoteste: `pnpm bench:selftest` (resultado em [TASK-002](tasks/TASK-002.md)).
- **Métricas, por processo e somadas:**
  - `WorkingSet64` — residente; conta páginas compartilhadas mais de uma vez quando somado.
  - `PrivateMemorySize64` — commit privado.
  - *Working Set – Private* — residente não compartilhado.
  - CPU.
- **Residente e privada são reportadas separadamente.**
- **5 execuções por cenário:** mediana, mínimo e máximo; ocioso, carga e pico separados.
- **Fixtures determinísticas** com seed fixa (`20261028`) e SHA-256 registrado em `scripts/bench/fixtures.sha256.json`; `pnpm bench:fixtures` confere. Um servidor loopback (`scripts/bench/server.mjs`, 127.0.0.1) serve as respostas.

  | Fixture | Conteúdo | SHA-256 | Bytes |
  |---|---|---|---|
  | `openapi-1000.json` | OpenAPI 3, 1.000 operações | `cc3f4625…c092fa` | 868.300 |
  | `large-20mib.json` | array JSON de 20 MiB | `929a3e78…f8775a` | 20.971.581 |
  | `workspace-10x100.json` | workspace v2, 10 projetos × 100 endpoints | `55ab24b1…901608` | 1.338.440 |

## Cenários

1. Inicialização: tempo até a UI ficar pronta e memória em T+5 s.
2. Ocioso: 60 s.
3. Importar 1.000 endpoints.
4. Buscar.
5. "10 abas", simulado como 10 endpoints abertos em sequência (o app não tem abas de requisição).
6. Resposta JSON de 20 MB. O Electron corta em 10 MB; o Tauri é medido com o mesmo limite e depois sem ele.
7. Trocar de projeto.
8. Uso contínuo: inclinação da memória privada ao longo das iterações.

Inicialização e ocioso rodam sem automação, iniciando o executável diretamente. Os demais usam Playwright sobre o DOM, com passos compartilhados pelos dois hosts.

## Resultados

_Ainda não medidos._ Baseline Electron: TASK-003. Protótipo Tauri: TASK-007. Comparação completa: TASK-017.
