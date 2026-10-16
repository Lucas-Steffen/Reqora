const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence');
const inventory = JSON.parse(fs.readFileSync(path.join(evidence, 'raw', 'asar-inventory.json'), 'utf8'));
const fd = fs.openSync(inventory.source, 'r');
const sources = new Map();
function source(name) {
  const member = `dist/renderer/${name}`;
  if (sources.has(member)) return sources.get(member);
  const entry = inventory.files.find(f => f.path === member);
  if (!entry || entry.unpacked || entry.link) throw new Error(`Unavailable member: ${member}`);
  const original = Buffer.alloc(entry.size);
  fs.readSync(fd, original, 0, original.length, inventory.data_offset + Number(entry.offset));
  const local = path.join(evidence, 'extracted', ...member.split('/'));
  const extracted = fs.readFileSync(local);
  if (!original.equals(extracted)) throw new Error(`Extracted member differs from ASAR: ${member}`);
  const result = {
    member,
    extracted: local,
    sha256: crypto.createHash('sha256').update(original).digest('hex'),
    artifact_byte_offset: inventory.data_offset + Number(entry.offset),
    size: original.length,
    text: extracted.toString('utf8'),
  };
  sources.set(member, result);
  return result;
}
function excerpt(name, module, anchor, length, from = 0) {
  const s = source(name);
  const start = s.text.indexOf(anchor, from);
  if (start < 0) throw new Error(`Missing anchor: ${name}: ${anchor}`);
  const end = Math.min(s.text.length, start + length);
  const before = s.text.slice(0, start);
  const lines = before.split('\n');
  return {
    member: s.member,
    webpack_module: module,
    sha256: s.sha256,
    utf16_start: start,
    utf16_end_exclusive: end,
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
    snippet: s.text.slice(start, end),
  };
}
function through(name, module, anchor, endAnchor, from = 0) {
  const text = source(name).text;
  const start = text.indexOf(anchor, from);
  const end = text.indexOf(endAnchor, start);
  if (start < 0 || end < 0) throw new Error(`Missing excerpt boundary: ${name}`);
  return excerpt(name, module, anchor, end + endAnchor.length - start, from);
}
const main = '49423.3a17a3ae.async.js';
const filters = '73132.0c1a5679.async.js';
const endpoints = '90387.c69ddba9.async.js';
const history = '61133.d5ccc339.async.js';
const docs = '6238.515d28a5.async.js';
const facts = [];
function fact(id, title, observation, excerpts) { facts.push({ id, title, observation, excerpts }); }

fact('UI-01', 'Shared workspace-tree history input',
  'Webpack module 847513 defaults historyStorageKey to mainTreeSearchHistoryList. It loads/stores an array through s.wc with the s.YM.SearchHistory namespace, maps entries to label/value options, allows clearing the input, and disables defaultActiveFirstOption. Focus opens the history only when entries exist and keyword is empty; choosing an option calls setKeyword and closes the popup.', [
    through(main, 847513, 'historyStorageKey:y="mainTreeSearchHistoryList"', 'options:M,'),
  ]);
fact('UI-02', 'History commit and clear',
  'The input onPressEnter handler inserts a nonempty current keyword first, removes exact duplicate prior entries, truncates the stored list to ten, and closes the popup. The Clear control calls I, whose body stores an empty list and closes the popup. This handler does not itself open an endpoint.', [
    through(main, 847513, 'onPressEnter:()=>{o?.length', '.slice(0,10)),S(!1))}'),
    excerpt(main, 847513, 'I=()=>{k([]),S(!1)}', 'I=()=>{k([]),S(!1)}'.length),
    through(main, 847513, 'onClick:I,children:(0,a.hw)', 'id:"mainTreeList.search.searchHistoryClear"})'),
  ]);
fact('UI-03', 'Composition-aware workspace keyword input',
  'Composition start sets a ref true. onSearch records the current string but suppresses onChange while that ref is true. Composition end schedules onChange of the recorded string, then resets the ref. These are static code paths; this investigation did not type with an IME in the running app.', [
    through(main, 847513, 'g=(0,u.useRef)(!1),A=(0,u.useRef)', 'g.current=!1})},[n])'),
    through(main, 847513, 'onSearch:e=>{S(0===e.length)', 'g.current||n(e)}'),
    excerpt(main, 847513, 'onCompositionStart:v,onCompositionEnd:b', 'onCompositionStart:v,onCompositionEnd:b'.length),
  ]);
fact('UI-04', 'Default workspace filter controls',
  'Module 551625 constructs the shared search/filter bar for CreateGrpcMenuButton, CreateDubboMenuButton, and its general branch-aware k component. Each passes status, tags, and maintainer as defaultFilters. D connects the shared history input keyword/setKeyword/onChange to the search and setSearch store functions.', [
    excerpt(endpoints, 551625, 'function O(){let e=(0,E.v)()', 975, 105000),
    excerpt(endpoints, 551625, 'return(0,o.jsx)(s.A,{filters:n,defaultFilters:', 190, 107000),
  ]);
fact('UI-05', 'Available workspace metadata filters',
  'Module 8789 returns status, tags, maintainer, creator, latestEditor, then custom field definitions G. Tags set showExclude:true. G is built from fields satisfying enable and (0,r.x)(fieldType); their keys use customFields- plus field ID.', [
    excerpt(endpoints, 8789, 'G=(C=F,w=', 700, 108000),
    excerpt(endpoints, 8789, 'return(0,p.useMemo)(()=>[{key:"status"', 524, 110000),
  ]);
fact('UI-06', 'Filter presentation and selection semantics',
  'Module 738826 initializes showFilter from defaultShowFilter or false. Each filter is a multiple select. The per-filter options text input appears only when options.length > 10; its matcher trims the text and calls label.includes without lowercasing. Supported filters offer Include/Exclude; exclude maps to all known option values not present in the excluded list. Reset clears filter information and restores the default filter control list. The collapsed filter trigger displays the active filter count when nonzero.', [
    excerpt(filters, 738826, 'S=(0,i.useMemo)(()=>{let e=A?.trim()', 447),
    excerpt(filters, 738826, 'e.defaultShowFilter??!1', 231),
    excerpt(filters, 738826, 'j&&(0,l.jsx)(m.A,', 365),
    excerpt(filters, 738826, 'selected:(s?.options||[]).map', 409),
    excerpt(filters, 738826, 'icon:a?(0,l.jsx)(M.A,{size:"small",count:s', 132),
  ]);
fact('UI-07', 'Request history has a distinct search scope',
  'Request-history input uses requestHistoryTreeSearchHistoryList. It selects localRequestHistoryList or teamRequestHistoryList according to tabType, offers a creator filter for TEAM, and searches e.name or e.url through helper F.w before requiring every metadata condition to match. This proves the passed fields, not the internal semantics of F.w. The tab options are LOCAL and TEAM.', [
    excerpt(history, 961342, 'function H({tabType:e,value:t,onChange:s})', 1240),
    excerpt(history, 961342, 'let{keyword:s,conditions:r=[]}', 238),
    excerpt(history, 961342, 'u=(0,p.useMemo)(()=>[{value:"LOCAL"', 288),
  ]);
fact('UI-08', 'Request-history opening and empty state',
  'Request-history row onClick calls z.h0 with id, projectId, and tabType. onDoubleClick calls the same helper with tabState:"resident" added. Its empty-state branch is !loading and zero tree rows, rendering icon-no-data and locale key noContent. This fact is scoped to request history, not the endpoint tree.', [
    excerpt(history, 961342, 'onClick:()=>{(0,z.h0)', 220),
    excerpt(history, 961342, 'let B=!a&&0===h.length;', 559),
  ]);
fact('UI-09', 'Ctrl/Meta+F is a separate find-in-page path',
  'The project renderer registers the shortcut expression sS.U0?"meta.f":"ctrl.f" and opens a find bar only when L.xl is true. The platform-flag definition was not traced in this ledger. Module 221057 sends Search.StartFindInPage with text, debounces ordinary edits by 800 ms, sends isNext:true on Enter, and sends Search.StopFindInPage plus clears results on empty input or Escape. This is renderer IPC, not an observed network call and not proof of a workspace-search shortcut.', [
    excerpt(main, 221057, 'if(!function(){let{isSearching:e,setIsSearching:t}', 263),
    excerpt(main, 221057, 'let y=(0,x.useCallback)(e=>{if(!e.trim())', 431),
    excerpt(main, 221057, 'onKeyDown:e=>{if("Escape"===e.key)', 309),
  ]);
fact('UI-10', 'Published documentation search is configured separately',
  'Module 854536 reads docsSite.searchSettings and offers DEFAULT, LOCAL, and ALGOLIA values. This is a docsSite settings form; it is distinct from the workspace tree/search bar traced above. English locale text says the default documentation engine is limited to API names/titles, URL paths, and tags, while Local Search builds a full-text browser index. These descriptions are shipped strings, not runtime verification of either engine.', [
    excerpt(docs, 854536, 'w=(0,h.useMemo)(()=>[{value:"DEFAULT"', 367),
  ]);

const locale = source('locale.en-US.7f650682917bf2b5.js');
const localeKeys = [
  'mainTreeList.search.searchHistory', 'mainTreeList.search.searchHistoryClear',
  'menu.filter.title', 'menu.filters.hide', 'menu.filters.show', 'menu.filters.clear',
  'menu.filters.chosen', 'menu.filters.include', 'menu.filters.exclude',
  'api.label.status', 'api.label.tags', 'api.label.responsible', 'api.label.creator',
  'api.label.latestEditor', 'component.search.noMatch', 'noContent',
  'requestHistory.mine.title', 'requestHistory.team.title',
  'apiDoc.publishSettings.online.searchSettings.type.default.description',
  'apiDoc.publishSettings.online.searchSettings.type.default.localSearch.description',
];
const localeFacts = localeKeys.map(key => {
  const anchor = `"${key}":`;
  const start = locale.text.indexOf(anchor);
  if (start < 0) throw new Error(`Missing locale key: ${key}`);
  const valueStart = start + anchor.length;
  let end = valueStart + 1;
  while (end < locale.text.length) {
    if (locale.text[end] === '\\') { end += 2; continue; }
    if (locale.text[end] === '"') { end++; break; }
    end++;
  }
  return { key, raw_literal: locale.text.slice(valueStart, end), ...excerpt('locale.en-US.7f650682917bf2b5.js', null, anchor, end - start) };
});
fs.closeSync(fd);
const sourceRecords = [...sources.values()].map(({ text, ...metadata }) => metadata);
const report = { evidence_type: 'static packaged JavaScript; shell/Node extraction, not REA Evidence or runtime observation', source_asar: inventory.source, offset_convention: 'Zero-based UTF-16 code-unit offsets, end exclusive, in UTF-8-decoded packed member. Line/column are one-based.', sources: sourceRecords, facts, locale_facts: localeFacts };
fs.writeFileSync(path.join(evidence, 'raw', 'ui-search-facts.json'), JSON.stringify(report, null, 2) + '\n');

const md = [
  '# Packaged UI/search evidence',
  '',
  'This ledger records static observations from the user-selected installed `resources/app.asar`. Every extracted source was byte-compared to the corresponding ASAR member before generating this file. Nothing here claims the application was executed or that a network request was observed. These are ordinary shell/Node evidence references, not REA Evidence IDs.',
  '',
  '**Location convention:** zero-based UTF-16 code-unit offsets in the UTF-8-decoded packed member; ranges use an exclusive end. Line/column are one-based. Member SHA-256 values refer to the original bytes. The JSON companion preserves complete metadata: [raw/ui-search-facts.json](raw/ui-search-facts.json). Regenerate with `node docs/apidog-search/tools/collect-ui-search-evidence.cjs`.',
  '',
  '## Facts',
  '',
];
for (const f of facts) {
  md.push(`### ${f.id}: ${f.title}`, '', f.observation, '');
  for (const ex of f.excerpts) {
    md.push(`Source: \`${ex.member}\`${ex.webpack_module ? `, webpack module \`${ex.webpack_module}\`` : ''}, UTF-16 [${ex.utf16_start}, ${ex.utf16_end_exclusive}), line ${ex.line}, column ${ex.column}.`, '', '```js', ex.snippet, '```', '');
  }
}
md.push('### UI-11: English label declarations', '', 'The following literal declarations exist in the English locale bundle. A string declaration alone does not establish which screen renders it. The `noContent` row is tied to request history by UI-08; `component.search.noMatch` is a generic label and is not evidence that endpoint search uses it.', '', '| Key | Literal | UTF-16 range |', '| --- | --- | --- |');
for (const l of localeFacts) md.push(`| \`${l.key}\` | ${l.raw_literal.replaceAll('|', '\\|')} | [${l.utf16_start}, ${l.utf16_end_exclusive}) |`);
md.push('', '## Source identity', '', '| Packed member | SHA-256 | ASAR byte offset |', '| --- | --- | --- |');
for (const s of sourceRecords) md.push(`| \`${s.member}\` | \`${s.sha256}\` | ${s.artifact_byte_offset} |`);
md.push('', '## Inferences', '', '- The shared history input and filter bar appear intended to keep repeated project-tree searches quick. This is an interpretation of UI-01 through UI-06, not a timing/performance measurement.', '- Request-history double-click appears intended to pin or retain the opened tab because it adds `tabState:"resident"`; the precise lifecycle is not established by the row handler alone.', '- Published documentation search, workspace tree search, request-history search, and find-in-page are separate paths. UI-01, UI-04, UI-07, UI-09, and UI-10 directly show distinct data/handlers; the broader product taxonomy is an interpretation.', '', '## Unknowns and boundaries', '', '- No runtime UI screenshot, request capture, or interaction was collected by this sub-investigation.', '- Main endpoint keyword matching/ranking, its exact searchable fields, and any workspace-search launch shortcut are intentionally left to the separate algorithm evidence ledger. Ctrl/Cmd+F here must not be relabeled as workspace search.', '- The storage wrapper backing `s.wc` was not traced here; this ledger establishes its namespace/key/API calls, not whether the implementation uses localStorage, a file, or another store.', '- Generic filter-option search semantics in UI-06 must not be applied to workspace keyword matching.', '- Original minified identifiers and snippets are preserved without rewriting. Small fragments may start/end inside a surrounding expression; offsets refer to the original member.', '');
fs.writeFileSync(path.join(evidence, 'ui-search-facts.md'), md.join('\n'));
console.log(JSON.stringify({ facts: facts.length, locale_declarations: localeFacts.length, verified_members: sourceRecords.length, markdown: path.join(evidence, 'ui-search-facts.md') }));
