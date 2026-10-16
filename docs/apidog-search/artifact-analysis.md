# Artifact identity, tooling and reproduction

The investigation started at the requested `C:\Users\Lucas Steffen\AppData\Local\Programs\Apidog\resources\app.asar`. No native binary analysis or execution was performed. [`evidence/artifact-identity.json`](evidence/artifact-identity.json) records the ASAR SHA-256 `bfc70fa7511ec83de76abbf90386f0f881a44aa444792e0f449a3cf3cf9bab64`, its 440,675,242-byte length and modification time.

The ordinary Node parser found 43,193 file/link entries (41,858 packed and 1,335 marked unpacked), including 1,166 JavaScript member names under `dist/renderer`. Zero member names end in `.map`; inline source maps were not separately ruled out. Inventory is retained locally at `evidence/raw/asar-inventory.json`. These are filesystem observations, not REA Evidence.

## REA result and limitations

Installed REA CLI version: 6.5.0. The installed skill version was 37. REA MCP tools were absent in this chat; the read-only `rea doctor --client codex --json` reported missing Codex registration/config drift. Existing CLI static JavaScript analysis worked without changing Codex configuration or installing any engine. The CLI help did not expose a `--detail summary` argument, so an exact source path and bounded semantic node budgets were used.

The first exact-file attempt selected the small published-document search settings chunk. REA refused the archive under its default integrity policy because the unpacked companion `node_modules/ssh2/util/pagent.exe` disagrees with its declared ASAR hash. This error is preserved at `evidence/raw/rea-search-settings.json`. The investigation then identified project-tree UI as a different surface and used `record-and-continue` for one exact selected source, preserving the contradiction rather than asserting trust in those unrelated native bytes. No companion native code was executed or decompiled.

The successful canonical result is retained locally at `evidence/raw/rea-tree-search.json`:

- Evidence ID: `ev_04474c9ce8b492a2fefb876fbf61a4e9d185901ea3aeecb45a8a92f89de8f2b0`.
- Operation: `analyze_javascript_application`.
- Selected source: `dist/renderer/49423.3a17a3ae.async.js`.
- Unselected inventoried source files: 40,792.
- Parameters: 1,500 total semantic nodes; 1,500 per file; 60,000 ms per-source analysis timeout; integrity `record-and-continue`.
- Raw output size: 688,955,842 bytes. The whole archive inventory and explicit unknown nodes for unselected sources make the output much larger than the one selected JavaScript source.
- Coverage is explicitly incomplete. Syntax was parsed inertly; relationships through unselected files are unknown. Static paths/imports/requests do not establish execution.

[`evidence/rea-tree-summary.json`](evidence/rea-tree-summary.json) is a deliberately labeled **ordinary bounded byte-window metadata projection**, not a canonical REA Evidence object. Its header/footer are parsed from the first 8,192 and last 32,768 bytes, with the exact window positions recorded. The canonical raw output is preserved untouched. Loading the whole result into Node to prepare the official `inspect-analysis-view` request hit `ERR_STRING_TOO_LONG` (`0x1fffffe8` characters); the dependent view command could not read a request file. The graph was not fully loaded or reviewed. A separate structural streaming pass (`tools/project-rea-coverage.cjs`) records exact normalized-result field byte ranges and parses only the small summary/statistics/limitations fields. REA reports one parsed JavaScript file, 208,024 text bytes, 57,810 AST nodes, 47 modules and zero parse failures; these counts do not make overall coverage complete. The extractor summary reports zero IPC operations even though ordinary source inspection finds aliased `l.gc.send` calls, so extractor zeros must not be treated as feature absence. There was no repeated identical application analysis merely to regenerate a smaller display.

Core predicate and data-adapter findings in `core-analysis.md` are grounded in separately hash-verified ordinary extraction of `90387` and `20401`. Do not attribute those exact core findings to the narrower `49423` REA analysis.

## Reproduction

Run these from PowerShell with Node and the installed `rea` on PATH. Scripts use explicit paths under this evidence directory and do not invoke Apidog.

```powershell
node '.\docs\apidog-search\tools\asar-inspect.cjs'
node '.\docs\apidog-search\tools\scan-renderer.cjs'
node '.\docs\apidog-search\tools\scan-search-seeds.cjs'
node '.\docs\apidog-search\tools\asar-inspect.cjs' 'dist/renderer/90387.c69ddba9.async.js' 'dist/renderer/20401.291e096a.async.js'
node '.\docs\apidog-search\tools\collect-core-evidence.cjs'
```

The parser reads the ASAR header and selected packed member byte ranges. The core collector validates extracted-file SHA-256 against the header's declared SHA-256 and writes original ASAR/member byte offsets as well as decoded UTF-16 offsets and one-based line/column positions. The locale/minified bundles contain non-ASCII text, so UTF-16 offsets and byte offsets must not be interchanged.

The successful REA command was:

```powershell
rea analyze-javascript-application 'C:\Users\Lucas Steffen\AppData\Local\Programs\Apidog\resources\app.asar' --source-path 'dist/renderer/49423.3a17a3ae.async.js' --max-semantic-nodes 1500 --max-semantic-nodes-per-file 1500 --analysis-timeout-ms 60000 --integrity-policy record-and-continue --format json > 'E:\Projects\Personal\Reqora\docs\apidog-search\evidence\raw\rea-tree-search.json'
```

The projection can be regenerated without loading the full raw output into memory:

```powershell
node '.\docs\apidog-search\tools\project-rea-metadata.cjs'
node '.\docs\apidog-search\tools\project-rea-coverage.cjs'
```

`evidence/raw` and `evidence/extracted` are retained as local investigation artifacts and should remain excluded from Git because they contain large vendor bundles and generated REA data. The compact reports, provenance and exact bounded snippets are the reviewable evidence.

