# Decisões (ADRs)

Cada ADR registra contexto, decisão, alternativas e consequências. Um ADR aceito só muda por outro ADR que o substitua.

---

## ADR-001 — Stack candidata: Tauri 2, condicionada a um gate de memória

**Estado:** Aceito. O gate da TASK-007 deu Go (ver ADR-005).

**Contexto.** O Reqora roda em Electron 44.8 e o motivo da migração é o consumo de RAM. Todo o domínio (busca, importer, ambientes, runner, workspace) já é TypeScript puro e testado; só `src/main`, o preload e 3 gateways dependem de Electron (ver [audit.md](audit.md)). Os números públicos de Electron × Tauri no Windows são contraditórios e não servem de prova (ver [research.md](research.md)).

**Decisão.** Tauri 2 é a stack candidata, porque reaproveita a UI React e o domínio TS integralmente. Ela só é adotada se passar no gate da TASK-007:

- **Go:** a memória privada da árvore de processos do protótipo Tauri fica abaixo da do Electron, sem sobreposição entre os intervalos mín–máx de 5 execuções, nos cenários de inicialização e ocioso.
- **Empate:** testar `MemoryUsageTargetLevel=Low`, `TrySuspendAsync` em segundo plano e o processo de GPU. Se continuar empatado, a decisão volta ao usuário com os números, antes de qualquer protótipo em Qt ou Avalonia.

**Alternativas.** Qt 6 e Avalonia 12 exigiriam reescrever a UI inteira sem prova de necessidade, o que o spec proíbe, e têm ressalvas de licença (LGPL com obrigações; TreeDataGrid comercial).

**Consequências.** O Electron continua funcionando até a Fase E. Nenhuma afirmação de ganho é feita sem medição neste repositório.

---

## ADR-002 — Divisão entre TypeScript e Rust

**Estado:** Aceito.

**Contexto.** Duplicar o domínio em Rust criaria duas implementações a manter e testar.

**Decisão.**
- **Fica em TypeScript:** UI, busca, pipeline do importer (num Web Worker), ambientes, preparação da requisição e o schema do workspace, incluindo `normalizeWorkspace` e a migração v1→v2.
- **Vai para Rust:** todo IO de sistema operacional e tudo que é sensível: arquivos, rede, segredos, diálogos, confinamento de caminhos e a cópia do perfil legado.
- **O Rust trata o workspace como JSON opaco** (`serde_json::Value` com `preserve_order`) e valida só o envelope: versão, tamanho e revisão.
- **Os tipos IPC do Rust espelham `src/shared/api.ts`**, com fixtures de contrato testadas dos dois lados. Sem geração de código.
- **Todo `invoke()`/`listen()` fica em `src/renderer/src/platform/`**, com adapters `tauri`, `electron` (até a Fase E) e `memory`.

**Consequências.** O schema tem uma única fonte de verdade. O Rust não descarta campos desconhecidos nem reformata números.

---

## ADR-003 — Dados: diretório próprio, cópia do legado, formato v2 inalterado

**Estado:** Aceito.

**Contexto.** O spec proíbe alterar o formato silenciosamente. O Electron grava em `%APPDATA%\reqora`; o Tauri usa o diretório do identificador do app.

**Decisão.**
- O Tauri usa `%APPDATA%\com.reqora.app`.
- Na primeira execução, se não houver workspace ali e existir `%APPDATA%\reqora\workspace.json`, são **copiados** `workspace.json`, `secrets.json` e os `*.backup.json`. Os originais não são tocados.
- É gravado `legacy-import.json` com a origem, o SHA-256 de cada arquivo e a data.
- O formato continua v2. A migração v1→v2 com backup continua em TS.
- Preferências e histórico de busca saem do localStorage para `preferences.json` no backend (TASK-004), porque a origem do WebView muda entre hosts e levaria o localStorage junto.

**Consequências.** A cópia é única: se o usuário voltar ao Electron depois da cópia, os dados divergem. Isso fica documentado até a Fase E.

---

## ADR-004 — Cofre de segredos: chave-mestra no keyring + AES-256-GCM

**Estado:** Aceito.

**Contexto.** Hoje os segredos usam `safeStorage` do Electron (DPAPI no Windows, blobs `v10` com AES-GCM). O Tauri não tem `safeStorage`; o Stronghold não é mais recomendado e não há plugin oficial de keyring. O Windows Credential Manager limita cada credencial a cerca de 2,5 KB.

**Decisão.**
- Uma chave-mestra aleatória de 256 bits fica no keyring do SO (crate `keyring`).
- Os valores ficam em `secrets.v2.json`, versionado, cada um cifrado com AES-256-GCM e nonce único.
- O `secrets.json` legado nunca é sobrescrito. A migração no Windows usa DPAPI para liberar `os_crypt.encrypted_key` de `Local State` e abre os blobs `v10` (TASK-011).
- Se um segredo não puder ser migrado, ele fica com `hasStoredSecret: false` e a UI pede para redefini-lo. Nunca é apagado nem gravado em texto puro.
- No envio, o WebView recebe placeholders `rqs_<hex>_<i>` em vez dos valores, e o Rust substitui e mascara (desenho escolhido pelo usuário; ADR detalhado na TASK-012).
- As regras atuais continuam: extração de todos os projetos, `copySecretFrom`, `retainOnly`, `reveal` restrito.

**Alternativas.** Uma entrada no keyring por segredo (esbarra no limite de tamanho e polui o cofre do SO); Stronghold (não recomendado).

**Consequências.** Se o keyring estiver indisponível, a mensagem de erro deve ser idêntica à atual.

---

## ADR-005 — Gate de memória: Go para o Tauri 2

**Estado:** Aceito.

**Contexto.** O ADR-001 condicionou o Tauri a um gate: a memória privada da árvore de processos precisa ficar abaixo da do Electron, sem sobreposição dos intervalos mín–máx de 5 execuções, na inicialização e no ocioso. O protótipo da TASK-006 foi medido com o mesmo amostrador, na mesma máquina e com a mesma fixture `workspace-10x100.json` do baseline da TASK-003. Os detalhes estão em [BENCHMARKS.md](BENCHMARKS.md).

**Números** (MiB, mediana (mín–máx) de 5 execuções, Windows 11, WebView2 156.0.4314.50):

| Momento | Privada Electron | Privada Tauri | Diferença das medianas |
|---|---|---|---|
| T+5 s | 232 (232–235) | 202 (201–205) | −30 |
| Ocioso 5–65 s, mediana | 221 (218–224) | 195 (187–197) | −26 |
| Ocioso 5–65 s, pico | 233 (232–235) | 203 (202–208) | −30 |
| Fim do ocioso (60–65 s) | 217 (216–220) | 191 (183–193) | −26 |

**Decisão.** **Go.** Em todos os momentos, o máximo do Tauri fica abaixo do mínimo do Electron. Os ajustes do WebView2 (`MemoryUsageTargetLevel=Low`, `TrySuspendAsync` e processo de GPU) não foram necessários para passar no gate. Eles ficam como otimização futura, a medir na Fase D.

**Ressalvas** (registradas, não escondidas):

- **A vantagem é modesta:** cerca de 12% da memória privada. Isso confirma o que a pesquisa previa para o Windows, onde o WebView2 também é Chromium. O ganho maior tem de vir da arquitetura (Fases C e D), não da troca de shell.
- **A residente privada (wsPriv) empata:** 105 (104–107) contra 105 (105–108) em T+5 s, e 96 (95–98) contra 93 (93–96) no fim do ocioso. A métrica do gate é a privada (commit), como definido no ADR-001.
- **A residente (ws) é maior no Tauri:** 366 contra 352 MiB em T+5 s. O Tauri abre 7 a 8 processos, contra 4 do Electron, e o ws soma páginas compartilhadas mais de uma vez.
- **O processo do app em si é pequeno:** o `reqora.exe` fica em cerca de 5 MiB privados. O resto é do WebView2.
- **Só inicialização e ocioso foram medidos.** Os cenários de carga só ficam comparáveis na TASK-017, com o backend Rust. Hoje o Tauri ainda não envia requisições nem importa.

**Alternativas.** Com o Go, Qt 6 e Avalonia 12 não são prototipados (ADR-001).

**Consequências.** A Fase C começa pela TASK-008. A Fase E (remoção do Electron) continua condicionada à paridade funcional. Se a TASK-017 mostrar que o Tauri perde nos cenários de carga, este ADR é revisto com os números.

## ADR-006 — Adapter Tauri com áreas ligadas por flag e fallback por área

**Estado:** Aceito (TASK-008).

**Contexto.** O backend Rust chega em partes ao longo da Fase C: workspace (TASK-009), segredos (TASK-010), envio (TASK-012) e import (TASK-013). Enquanto isso, o build Tauri precisa continuar abrindo a UI, e o Electron precisa continuar intacto.

**Decisão.**
- `detectPlatform` verifica `__TAURI_INTERNALS__` antes de `window.reqora`, e só então cai para o navegador.
- `createTauriApi` só inclui uma área do contrato quando a flag dela em `TAURI_BACKEND` é verdadeira. Cada TASK liga a sua junto com os commands Rust.
- Os gateways escolhem **por área**: usam a área do desktop se ela existir e, senão, o fallback em página que já existia (memory, navegador). Nenhum gateway assume que `desktopApi()` é completa.
- Nomes de commands, parâmetros e o formato `{ code, message }` dos erros ficam numa fixture JSON lida pelos testes dos dois lados. Não há geração de código.

**Alternativas.** Um adapter tudo-ou-nada, que deixaria o Tauri no adapter memory até a TASK-013, impediria validar cada área assim que ela existe. Gerar os tipos (ts-rs, specta) acrescentaria dependências e um passo de build sem necessidade comprovada para 10 commands.

**Consequências.** No Tauri, uma área sem backend usa dados só em memória, o que é esperado durante a Fase C e não vale como paridade. A TASK-026 confere que todas as flags estão ligadas antes de remover o Electron.

## ADR-007 — Store de workspace em Rust como JSON opaco

**Estado:** Aceita (TASK-009)

**Contexto:** o arquivo `workspace.json` precisa continuar no mesmo formato e com os mesmos bytes, para que Electron e Tauri convivam até a Fase E sem diffs espúrios nem perda de campos.

**Decisão**
- O Rust guarda o workspace como `serde_json::Value` com `preserve_order` e `float_roundtrip`, e grava com um formatter que segue `JSON.stringify(value, null, 2)` (números ECMAScript, chaves de índice primeiro).
- O Rust valida só o envelope; schema, normalização e migração v1→v2 continuam em TypeScript, no adapter.
- O perfil Electron é copiado uma única vez, com SHA-256 por arquivo e manifesto `legacy-import.json`; os originais não são alterados. Falha na cópia deixa o store em erro, nunca no demo.
- A área `workspace` do adapter fica desligada até o cofre de segredos (TASK-010).

**Alternativas:** structs tipadas em Rust (duplicaria o schema e descartaria campos desconhecidos); `serde_json::to_vec_pretty` puro (bytes diferentes: `1.0`, `1e-7`, ordem de chaves).

**Consequências:** uma fixture compartilhada (`src/shared/contract/workspace-store/`) prova a igualdade de bytes nos dois lados; mudanças no serializador precisam mantê-la verde.
