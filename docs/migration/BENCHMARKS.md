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
- **Árvore de processos inteira.** Um amostrador PowerShell de longa duração lê `Win32_Process` a cada 100 ms e segue `ParentProcessId` a partir do PID raiz. Isso inclui os processos de renderer, GPU e utility do Electron e os `msedgewebview2.exe` do Tauri. O amostrador fica fora da árvore medida.
- **Métricas, por processo e somadas:**
  - `WorkingSet64` — residente; conta páginas compartilhadas mais de uma vez quando somado.
  - `PrivateMemorySize64` — commit privado.
  - *Working Set – Private* — residente não compartilhado.
  - CPU.
- **Residente e privada são reportadas separadamente.**
- **5 execuções por cenário:** mediana, mínimo e máximo; ocioso, carga e pico separados.
- **Fixtures determinísticas** com seed fixa e SHA-256 registrado: OpenAPI de 1.000 endpoints, JSON de 20 MB, workspace com N projetos. Um servidor loopback serve as respostas.

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
