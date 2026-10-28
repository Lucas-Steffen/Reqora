# Decisões (ADRs)

Cada ADR registra contexto, decisão, alternativas e consequências. Um ADR aceito só muda por outro ADR que o substitua.

---

## ADR-001 — Stack candidata: Tauri 2, condicionada a um gate de memória

**Estado:** Aceito como candidata; a decisão final sai na TASK-007.

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
