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

### Baseline Electron (TASK-003)

- **Execução:** `pnpm build` seguido de `pnpm bench:electron`, em 2026-10-28, das 08:46 às 09:07 UTC. Foram 35 de 35 execuções válidas, sem nenhuma falha.
- **Dados brutos:** [`bench-results/electron/`](bench-results/electron/) traz um CSV por execução, com uma linha por processo a cada tick, e o `summary.json`. As tabelas abaixo saem de `node scripts/bench/report.mjs`.
- **Ambiente:** o mesmo da tabela acima (Electron 44.8.0, Node 24.21.0, 12 threads lógicas). A memória livre da máquina antes de cada execução está em `machine`, dentro do `summary.json`.
- **Unidades:** valores em MiB, no formato mediana (mín–máx) das 5 execuções. "Antes" é a janela de 3 s antes da ação; "Durante" é a ação inteira; "Depois" são os últimos 2 s de uma espera de 5 s após a ação.

Detalhes que afetam a leitura:

- **Aquecimento.** Um lançamento de aquecimento é descartado antes das medições, porque o primeiro lançamento a frio passou do limite de 60 s numa tentativa anterior. Nesta rodada, o aquecimento ficou pronto em 6.694 ms.
- **Tempo até a UI ficar pronta.** O `readyMs` é medido com Playwright, do `launch` até o botão "Import OpenAPI / Swagger" aparecer, com o perfil novo e o cache de disco já aquecido. A inicialização sem automação não tem marcador de UI pronta, por isso ali só a memória é reportada.
- **Perfil.** Cada execução usa um perfil novo em `%TEMP%`. Todos os cenários, inclusive inicialização e ocioso, partem da fixture `workspace-10x100.json`. O import cria um 11º projeto.
- **Corte da resposta.** No cenário de resposta grande, o Electron corta o corpo de 20 MiB em 10 MiB e marca `(truncated)`. O Tauri será medido com o mesmo limite e depois sem ele.
- **"10 abas".** O app não tem abas de requisição, então o cenário abre 10 endpoints da árvore em sequência, com 300 ms entre eles.
- **Busca.** O cenário faz 3 rodadas de 5 consultas (`Get`, `Change`, `bench`, `large`, `42`), sempre esperando a primeira correspondência.
- **Troca de projeto.** O cenário faz 2 voltas pelos 10 projetos, com 300 ms entre as trocas.
- **Uso contínuo.** São 20 iterações. Cada uma troca de projeto, busca, abre 5 endpoints e envia a resposta grande. A inclinação vem de uma regressão linear da memória privada medida 1 s após cada iteração.

### Inicialização e ocioso (sem automação; 5 execuções válidas)

| Momento | Processos | Residente (ws) | Privada (commit) | Residente privada (wsPriv) |
|---|---|---|---|---|
| T+5 s | 4 (4–4) | 352 (352–358) | 232 (232–235) | 105 (105–108) |
| Ocioso 5–65 s, mediana | 4 (4–4) | 345 (343–352) | 221 (218–224) | 96 (95–100) |
| Ocioso 5–65 s, pico | 4 (4–4) | 353 (352–358) | 233 (232–235) | 105 (105–108) |
| Fim do ocioso (60–65 s) | 4 (4–4) | 342 (342–348) | 217 (216–220) | 93 (93–96) |

### Cenários com automação: tempos

| Cenário | Execuções válidas | UI pronta (ms) | Ação (ms) |
|---|---|---|---|
| import | 5/5 | 357 (347–362) | 591 (556–615) |
| search | 5/5 | 353 (350–382) | 3491 (3462–3522) |
| open-10 | 5/5 | 351 (348–365) | 3353 (3334–3434) |
| large-response | 5/5 | 355 (345–358) | 3379 (3370–3457) |
| project-switch | 5/5 | 351 (349–360) | 7201 (7166–7230) |
| continuous | 5/5 | 359 (352–379) | 93146 (93072–93472) |

### Cenários com automação: Privada (commit), MiB

| Cenário | Antes (mediana) | Durante (mediana) | Pico durante | Depois (mediana) |
|---|---|---|---|---|
| import | 244 (242–244) | 319 (312–333) | 381 (376–409) | 407 (404–408) |
| search | 246 (242–248) | 293 (289–294) | 315 (311–316) | 315 (312–317) |
| open-10 | 243 (239–243) | 255 (252–255) | 260 (257–262) | 254 (251–256) |
| large-response | 245 (245–249) | 428 (426–435) | 1167 (1166–1172) | 1154 (1153–1158) |
| project-switch | 243 (241–245) | 361 (355–366) | 407 (404–412) | 407 (395–412) |
| continuous | 244 (241–246) | 1352 (1348–1558) | 2008 (1921–2207) | 1650 (1534–1686) |

### Cenários com automação: Residente privada (wsPriv), MiB

| Cenário | Antes (mediana) | Durante (mediana) | Pico durante | Depois (mediana) |
|---|---|---|---|---|
| import | 111 (110–113) | 174 (166–187) | 222 (219–250) | 250 (248–252) |
| search | 114 (110–116) | 147 (143–149) | 168 (165–171) | 168 (165–171) |
| open-10 | 110 (110–111) | 119 (119–120) | 125 (124–125) | 124 (124–125) |
| large-response | 113 (113–116) | 282 (279–287) | 997 (996–999) | 989 (989–993) |
| project-switch | 111 (111–113) | 222 (218–226) | 268 (262–270) | 267 (257–270) |
| continuous | 110 (110–115) | 1206 (1199–1417) | 1809 (1767–2016) | 1502 (1398–1549) |

### Cenários com automação: Residente (ws), MiB

| Cenário | Antes (mediana) | Durante (mediana) | Pico durante | Depois (mediana) |
|---|---|---|---|---|
| import | 368 (367–371) | 436 (429–449) | 485 (483–513) | 514 (512–515) |
| search | 371 (368–373) | 408 (405–410) | 429 (427–433) | 429 (427–433) |
| open-10 | 368 (368–368) | 379 (378–380) | 384 (384–385) | 384 (384–385) |
| large-response | 371 (370–374) | 550 (546–555) | 1264 (1263–1267) | 1257 (1257–1260) |
| project-switch | 369 (368–371) | 483 (478–487) | 529 (523–531) | 528 (518–531) |
| continuous | 368 (367–373) | 1477 (1473–1692) | 2080 (2042–2290) | 1773 (1668–1823) |

### Uso contínuo: inclinação da memória privada

| Janela | KiB por iteração |
|---|---|
| Todas as iterações | 13791 (9410–30100) |
| Segunda metade | 33784 (28614–39824) |


**Observações (só sobre os dados acima):**

- **Inicialização e ocioso.**
  - A árvore tem 4 processos `electron.exe`: o principal e 3 filhos. O CSV não distingue o tipo de cada filho.
  - A memória privada em T+5 s é de 232 MiB, contra 352 MiB de residente.
  - Em ociosidade, a memória privada cai um pouco, para 217 MiB no fim dos 60 s.
- **Resposta grande.**
  - O corpo cortado em 10 MiB eleva a memória privada da árvore de 245 MiB para um pico de 1.167 MiB.
  - Ela continua em 1.154 MiB 5 s depois, porque a resposta fica retida enquanto está na tela.
- **Uso contínuo.**
  - A memória privada cresce sem estabilizar: o pico é de 2.008 MiB, e a inclinação na segunda metade é de cerca de 33 MiB por iteração.
  - Isso indica retenção de respostas grandes ao longo das trocas. A causa não foi investigada aqui; esse é o escopo das TASK-018 e TASK-024.
- **Import de 1.000 endpoints.** A memória privada termina 163 MiB acima do valor anterior ao import, e não volta nos 5 s seguintes.

### Lacunas

- **Inicialização sem automação.** Não há medida de tempo até a UI ficar pronta nesse modo, e o `readyMs` com automação inclui o custo de anexar o Playwright.
- **Sistemas operacionais.** Só o Windows foi medido. Linux e macOS não estão disponíveis nesta máquina.
- **Protótipo Tauri:** TASK-007. **Comparação completa:** TASK-017.
