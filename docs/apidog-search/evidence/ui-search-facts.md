# Packaged UI/search evidence

This ledger records static observations from the user-selected installed `resources/app.asar`. Every extracted source was byte-compared to the corresponding ASAR member before generating this file. Nothing here claims the application was executed or that a network request was observed. These are ordinary shell/Node evidence references, not REA Evidence IDs.

**Location convention:** zero-based UTF-16 code-unit offsets in the UTF-8-decoded packed member; ranges use an exclusive end. Line/column are one-based. Member SHA-256 values refer to the original bytes. The JSON companion preserves complete metadata: [raw/ui-search-facts.json](raw/ui-search-facts.json). Regenerate with `node docs/apidog-search/tools/collect-ui-search-evidence.cjs`.

## Facts

### UI-01: Shared workspace-tree history input

Webpack module 847513 defaults historyStorageKey to mainTreeSearchHistoryList. It loads/stores an array through s.wc with the s.YM.SearchHistory namespace, maps entries to label/value options, allows clearing the input, and disables defaultActiveFirstOption. Focus opens the history only when entries exist and keyword is empty; choosing an option calls setKeyword and closes the popup.

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `847513`, UTF-16 [24725, 25416), line 1, column 24726.

```js
historyStorageKey:y="mainTreeSearchHistoryList",className:j}=e,g=(0,u.useRef)(!1),A=(0,u.useRef)(""),v=(0,u.useCallback)(()=>{g.current=!0},[]),b=(0,u.useCallback)(()=>{setTimeout(()=>{n(A.current),g.current=!1})},[n]),[C,w]=(0,u.useState)(()=>s.wc.get(s.YM.SearchHistory,y,[])),[N,S]=(0,u.useState)(!1),M=(0,r.A)(()=>C.map(e=>({label:e,value:e})),[C]),k=(e=[])=>{s.wc.set(s.YM.SearchHistory,y,e),w(e)},I=()=>{k([]),S(!1)};return(0,i.jsx)(l.A,{className:c()(m.treeList__searchSelect,j),allowClear:!0,defaultActiveFirstOption:!1,onSearch:e=>{S(0===e.length),A.current=e,g.current||n(e)},open:N,onFocus:()=>{x?.(),S(C.length>0&&!o)},onSelect:e=>{h(e),S(!1)},onBlur:()=>{f?.(),S(!1)},options:M,
```

### UI-02: History commit and clear

The input onPressEnter handler inserts a nonempty current keyword first, removes exact duplicate prior entries, truncates the stored list to ten, and closes the popup. The Clear control calls I, whose body stores an empty list and closes the popup. This handler does not itself open an endpoint.

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `847513`, UTF-16 [26057, 26135), line 1, column 26058.

```js
onPressEnter:()=>{o?.length&&(k([o,...C.filter(e=>e!==o)].slice(0,10)),S(!1))}
```

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `847513`, UTF-16 [25128, 25147), line 1, column 25129.

```js
I=()=>{k([]),S(!1)}
```

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `847513`, UTF-16 [25882, 25956), line 1, column 25883.

```js
onClick:I,children:(0,a.hw)({id:"mainTreeList.search.searchHistoryClear"})
```

### UI-03: Composition-aware workspace keyword input

Composition start sets a ref true. onSearch records the current string but suppresses onChange while that ref is true. Composition end schedules onChange of the recorded string, then resets the ref. These are static code paths; this investigation did not type with an IME in the running app.

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `847513`, UTF-16 [24788, 24943), line 1, column 24789.

```js
g=(0,u.useRef)(!1),A=(0,u.useRef)(""),v=(0,u.useCallback)(()=>{g.current=!0},[]),b=(0,u.useCallback)(()=>{setTimeout(()=>{n(A.current),g.current=!1})},[n])
```

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `847513`, UTF-16 [25253, 25310), line 1, column 25254.

```js
onSearch:e=>{S(0===e.length),A.current=e,g.current||n(e)}
```

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `847513`, UTF-16 [26197, 26236), line 1, column 26198.

```js
onCompositionStart:v,onCompositionEnd:b
```

### UI-04: Default workspace filter controls

Module 551625 constructs the shared search/filter bar for CreateGrpcMenuButton, CreateDubboMenuButton, and its general branch-aware k component. Each passes status, tags, and maintainer as defaultFilters. D connects the shared history input keyword/setKeyword/onChange to the search and setSearch store functions.

Source: `dist/renderer/90387.c69ddba9.async.js`, webpack module `551625`, UTF-16 [105917, 106892), line 1, column 105918.

```js
function O(){let e=(0,E.v)(),t=(0,x.A)(e=>e.setFilterInfos);return(0,o.jsx)(s.A,{filters:e,defaultFilters:["status","tags","maintainer"],onFilter:t,searchBar:(0,o.jsx)(D,{}),extraActions:[(0,o.jsx)(j.A,{},"CreateGrpcMenuButton")]})}function T(){let e=(0,E.v)(),t=(0,x.A)(e=>e.setFilterInfos);return(0,o.jsx)(s.A,{filters:e,defaultFilters:["status","tags","maintainer"],onFilter:t,searchBar:(0,o.jsx)(D,{}),extraActions:[(0,o.jsx)(h.A,{},"CreateDubboMenuButton")]})}function D(){let e=(0,x.A)(e=>e.search),t=(0,x.A)(e=>e.setSearch),n=(0,y.A)(e=>e.onFocus),i=(0,y.A)(e=>e.onBlur);return(0,o.jsx)(a.A,{keyword:e,setKeyword:t,onChange:t,onFocus:n,onBlur:i})}let k=function(){let e=(0,A._$)(e=>e.projectCurrentBranch),t=(0,c.Ay)(e=>e.project.currentProject),n=(0,E.v)(),i=(0,x.A)(e=>e.setFilterInfos),a=function(){let e=(0,A._$)(e=>e.projectCurrentBranch.id),t=(0,r.hT)(e=>e.fetchApisAndTreeList),[n,i]=m.useState(null);return m.useEffect(()=>{let n=-1,s=r.hT.subscribe((s,a)=>{le
```

Source: `dist/renderer/90387.c69ddba9.async.js`, webpack module `551625`, UTF-16 [107921, 108111), line 1, column 107922.

```js
return(0,o.jsx)(s.A,{filters:n,defaultFilters:["status","tags","maintainer"],onFilter:i,searchBar:(0,o.jsx)(D,{}),extraActions:y,extraElement:a})};i()}catch(e){i(e)}})},8789:function(e,t,n){
```

### UI-05: Available workspace metadata filters

Module 8789 returns status, tags, maintainer, creator, latestEditor, then custom field definitions G. Tags set showExclude:true. G is built from fields satisfying enable and (0,r.x)(fieldType); their keys use customFields- plus field ID.

Source: `dist/renderer/90387.c69ddba9.async.js`, webpack module `8789`, UTF-16 [110669, 111369), line 1, column 110670.

```js
G=(C=F,w=(0,m.fnZ)("projectCustomApiField",({data:e})=>e),(0,p.useMemo)(()=>(w||[]).filter(e=>e.enable&&(0,r.x)(e.fieldType)).map(e=>{let t=`customFields-${e.id}`;return{key:t,title:e.fieldName,options:e.extra?.options||[],optionRenderer:e=>{let n=(0,x.KO)(C,e.value,t);return(0,i.jsxs)("p",{className:"flex items-center mb-0",children:[(0,i.jsx)(a.A,{style:{maxWidth:125},children:e.value}),(0,i.jsxs)("span",{children:["(",n,")"]})]})}}}),[w,C]));return(0,p.useMemo)(()=>[{key:"status",title:(0,o.hw)({id:"api.label.status"}),...B},{key:"tags",title:(0,o.hw)({id:"api.label.tags"}),showExclude:!0,...H},{key:"maintainer",title:(0,o.hw)({id:"api.label.responsible"}),options:U,...K},{key:"creator",t
```

Source: `dist/renderer/90387.c69ddba9.async.js`, webpack module `8789`, UTF-16 [111118, 111642), line 1, column 111119.

```js
return(0,p.useMemo)(()=>[{key:"status",title:(0,o.hw)({id:"api.label.status"}),...B},{key:"tags",title:(0,o.hw)({id:"api.label.tags"}),showExclude:!0,...H},{key:"maintainer",title:(0,o.hw)({id:"api.label.responsible"}),options:U,...K},{key:"creator",title:(0,o.hw)({id:"api.label.creator"}),options:U,...z},{key:"latestEditor",title:(0,o.hw)({id:"api.label.latestEditor"}),options:U,...q},...G],[U,B,H,K,z,q,G])}},979296:function(e,t,n){n.d(t,{A:()=>c});var i=n(838e3),o=n(794397),s=n(524836);let r="container-FfdQta";var a=
```

### UI-06: Filter presentation and selection semantics

Module 738826 initializes showFilter from defaultShowFilter or false. Each filter is a multiple select. The per-filter options text input appears only when options.length > 10; its matcher trims the text and calls label.includes without lowercasing. Supported filters offer Include/Exclude; exclude maps to all known option values not present in the excluded list. Reset clears filter information and restores the default filter control list. The collapsed filter trigger displays the active filter count when nonzero.

Source: `dist/renderer/73132.0c1a5679.async.js`, webpack module `738826`, UTF-16 [1127, 1574), line 1, column 1128.

```js
S=(0,i.useMemo)(()=>{let e=A?.trim();return e?r.filter(t=>t.label.includes(e)):r},[r,A]),M=(0,i.useMemo)(()=>r.length>10,[r.length]),k=(0,s.A)(e=>{T(e),p(d,e)});return(0,l.jsxs)("div",{className:f,children:[(0,l.jsx)(u.A,{size:e,value:d,onChange:e=>p(e,N),tagRender:e=>(0,l.jsx)(y,{tagProps:e,label:t,value:d,isExclude:N}),placeholder:t,className:x,mode:"multiple",showArrow:!0,showSearch:!1,autoBlurOnSelected:!1,dropdownMatchSelectWidth:j?285:20
```

Source: `dist/renderer/73132.0c1a5679.async.js`, webpack module `738826`, UTF-16 [6577, 6808), line 1, column 6578.

```js
e.defaultShowFilter??!1),{filterOptions:n,filtersSelected:o,onFilterSelect:c,onRemoveFilter:d}=function({filters:e,defaultFilters:t}){let[r,l]=(0,i.useState)(()=>t),a=(0,i.useMemo)(()=>e.map(e=>({value:e.key,label:e.title})),[e]),n
```

Source: `dist/renderer/73132.0c1a5679.async.js`, webpack module `738826`, UTF-16 [2150, 2515), line 1, column 2151.

```js
j&&(0,l.jsx)(m.A,{gap:!1,size:"small",className:"ml-auto",value:N?"exclude":"include",onChange:e=>k("exclude"===e),options:[{value:"include",label:(0,c.hw)({id:"menu.filters.include"})},{value:"exclude",label:(0,c.hw)({id:"menu.filters.exclude"})}]})]})]}),(0,l.jsx)(o.A,{type:"horizontal",className:"mt-0 mb-2"}),e]}),optionLabelProp:g,children:S.map(e=>(0,l.jsx)(
```

Source: `dist/renderer/73132.0c1a5679.async.js`, webpack module `738826`, UTF-16 [7542, 7951), line 1, column 7543.

```js
selected:(s?.options||[]).map(e=>e.value).filter(e=>!r.includes(e))}});return(0,i.useEffect)(()=>{t(d.map(u))},[d]),{filtersInfoList:d,filtersInfoMap:r,onFilterInfoChange:c,onFilterInfoRemove:a,onFilterInfoBatchRemove:n,onFilterInfoReset:o}}(e),_=(0,s.A)(()=>{x(),c(e.defaultFilters)}),w=(0,s.A)(e=>{h(e),d(e)}),v=(0,s.A)(e=>{e.length<o.length&&m(o.filter(t=>!e.includes(t))),c(e)}),j=(0,i.useMemo)(()=>e.filt
```

Source: `dist/renderer/73132.0c1a5679.async.js`, webpack module `738826`, UTF-16 [8725, 8857), line 1, column 8726.

```js
icon:a?(0,l.jsx)(M.A,{size:"small",count:s,children:(0,l.jsx)(h.A,{type:"icon-operate-filter"})}):(0,l.jsx)(h.A,{type:"icon-operate-
```

### UI-07: Request history has a distinct search scope

Request-history input uses requestHistoryTreeSearchHistoryList. It selects localRequestHistoryList or teamRequestHistoryList according to tabType, offers a creator filter for TEAM, and searches e.name or e.url through helper F.w before requiring every metadata condition to match. This proves the passed fields, not the internal semantics of F.w. The tab options are LOCAL and TEAM.

Source: `dist/renderer/61133.d5ccc339.async.js`, webpack module `961342`, UTF-16 [7422, 8662), line 1, column 7423.

```js
function H({tabType:e,value:t,onChange:s}){let{keyword:r}=t||{},{requestHistoryList:a}=(0,f.N)(t=>"TEAM"===e?{requestHistoryList:t.teamRequestHistoryList}:{requestHistoryList:t.localRequestHistoryList}),l=(0,L.Ay)(e=>e.projectMember.currentProjectMembers||[]),o=(0,p.useMemo)(()=>{if("LOCAL"===e)return[];let t={};return a.forEach(e=>{t[e.createdById]=(t[e.createdById]??0)+1}),[{key:"createdById",title:(0,n.hw)({id:"testScenario.filterLabel.creator"}),options:l.map(({userId:e,nickname:t,user:s})=>({label:t||s?.username||s?.name,value:e})),optionRenderer:e=>`${e.label}(${t[e.value]||0})`}]},[l,a,e]),c=e=>{s?.({...t,keyword:e})};return(0,i.jsx)(k.A,{filters:o,onFilter:e=>{s?.({...t,conditions:e})},searchBar:(0,i.jsx)("div",{className:"flex-1",onKeyDown:E.dG,children:(0,i.jsx)(C.A,{historyStorageKey:"requestHistoryTreeSearchHistoryList",keyword:r,setKeyword:c,onChange:c})})})}let R="tree-RkChJq";var I=s(454008),P=s(764007),q=s(159347),K=s(440270),M=s(929463),_=s(554692),O=s(618487);function D({dataSource:e,tabType:t="LOCAL"}){let{id:s,relatedId:r,projectId:a}=e,{teamRequestHistoryMap:l}=(0,f.N)(),c=(0,p.useRef)(),[d,u]=(0,p.useState)(!1),[m,h]=(0,p.useState)(!1),y=(0,O.fnZ)("clientConfig",({data:e})=>e?.historyInfoUrlPath||""
```

Source: `dist/renderer/61133.d5ccc339.async.js`, webpack module `961342`, UTF-16 [12497, 12735), line 1, column 12498.

```js
let{keyword:s,conditions:r=[]}=K,a=l.filter(e=>(!s||!!(0,F.w)(e.name||"",s)||!!(0,F.w)(e.url||"",s))&&r.every(t=>!(t.value.length>0)||t.value.includes(e[t.key]))),o=(0,N.groupBy)(a,e=>(0,g.HF)(e.createdAt));k(Object.keys(o).map(s=>{let r=
```

Source: `dist/renderer/61133.d5ccc339.async.js`, webpack module `961342`, UTF-16 [15156, 15444), line 1, column 15157.

```js
u=(0,p.useMemo)(()=>[{value:"LOCAL",label:(0,n.hw)({id:"requestHistory.mine.title"}),permission:o.o.HISTORY_LOCAL_READ},{value:"TEAM",label:(0,n.hw)({id:"requestHistory.team.title"}),permission:o.o.HISTORY_SHARE_READ}],[]),x=(0,Y.p)(e=>e.setSidebarRenderTime);return p.useEffect(()=>{x("h
```

### UI-08: Request-history opening and empty state

Request-history row onClick calls z.h0 with id, projectId, and tabType. onDoubleClick calls the same helper with tabState:"resident" added. Its empty-state branch is !loading and zero tree rows, rendering icon-no-data and locale key noContent. This fact is scoped to request history, not the endpoint tree.

Source: `dist/renderer/61133.d5ccc339.async.js`, webpack module `961342`, UTF-16 [10629, 10849), line 1, column 10630.

```js
onClick:()=>{(0,z.h0)({id:e.id,projectId:e.projectId,tabType:t})},onDoubleClick:()=>{(0,z.h0)({id:e.id,projectId:e.projectId,tabState:"resident",tabType:t})},actions:(0,N.compact)([{name:"",icon:(0,i.jsx)(D,{tabType:t,da
```

Source: `dist/renderer/61133.d5ccc339.async.js`, webpack module `961342`, UTF-16 [14242, 14801), line 1, column 14243.

```js
let B=!a&&0===h.length;return(0,i.jsxs)("div",{className:"h-full flex flex-col",children:[(0,i.jsx)(H,{tabType:e,value:K,onChange:M}),(0,i.jsx)("div",{ref:O,className:"flex-auto overflow-hidden",children:B?(0,i.jsx)("div",{className:"h-full flex items-center justify-center",children:(0,i.jsx)(T.A,{image:(0,i.jsx)(S.A,{type:"icon-no-data",size:50,className:"app-text-fg-disabled"}),description:(0,i.jsx)("p",{className:"app-text-fg-low",style:{fontWeight:"var(--ui-font-weight-400)"},children:(0,n.hw)({id:"noContent"})})})}):(0,i.jsx)(y.A,{className:"px-4 m
```

### UI-09: Ctrl/Meta+F is a separate find-in-page path

The project renderer registers the shortcut expression sS.U0?"meta.f":"ctrl.f" and opens a find bar only when L.xl is true. The platform-flag definition was not traced in this ledger. Module 221057 sends Search.StartFindInPage with text, debounces ordinary edits by 800 ms, sends isNext:true on Enter, and sends Search.StopFindInPage plus clears results on empty input or Escape. This is renderer IPC, not an observed network call and not proof of a workspace-search shortcut.

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `221057`, UTF-16 [151181, 151444), line 1, column 151182.

```js
if(!function(){let{isSearching:e,setIsSearching:t}=c();(0,sM.A)([sS.U0?"meta.f":"ctrl.f"],e=>{L.xl&&(e.preventDefault(),t(!0))}),(0,sM.A)(["esc"],()=>{e&&L.xl&&t(!1)})}(),n)return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(g.A,{errorType:n,error:o.current}),(0,i.j
```

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `221057`, UTF-16 [26891, 27322), line 1, column 26892.

```js
let y=(0,x.useCallback)(e=>{if(!e.trim()){l.gc.send("Search.StopFindInPage"),a(null),s.current?.focus();return}l.gc.send("Search.StartFindInPage",{text:e})},[a]),j=(0,x.useMemo)(()=>(0,h.debounce)(e=>{requestAnimationFrame(()=>{y(e)})},800),[y]);return((0,x.useEffect)(()=>()=>{j.cancel()},[j]),e)?(0,i.jsx)("div",{className:"fixed",style:{top:64,right:24,zIndex:1e3},children:(0,i.jsxs)("div",{className:f.A.searchBar,children:[(0
```

Source: `dist/renderer/49423.3a17a3ae.async.js`, webpack module `221057`, UTF-16 [27547, 27856), line 1, column 27548.

```js
onKeyDown:e=>{if("Escape"===e.key)t(!1),l.gc.send("Search.StopFindInPage"),a(null);else if("Enter"===e.key){let e=o.current;e.trim()&&(j.cancel(),l.gc.send("Search.StartFindInPage",{text:e,isNext:!0}))}},onCompositionStart:()=>{d.current=!0},onCompositionEnd:e=>{d.current=!1;let t=e.currentTarget.value;o.cur
```

### UI-10: Published documentation search is configured separately

Module 854536 reads docsSite.searchSettings and offers DEFAULT, LOCAL, and ALGOLIA values. This is a docsSite settings form; it is distinct from the workspace tree/search bar traced above. English locale text says the default documentation engine is limited to API names/titles, URL paths, and tags, while Local Search builds a full-text browser index. These descriptions are shipped strings, not runtime verification of either engine.

Source: `dist/renderer/6238.515d28a5.async.js`, webpack module `854536`, UTF-16 [5487, 5854), line 1, column 5488.

```js
w=(0,h.useMemo)(()=>[{value:"DEFAULT",label:(0,s.hw)({id:"apiDoc.publishSettings.online.searchSettings.type.default"})},{value:"LOCAL",label:(0,s.hw)({id:"apiDoc.publishSettings.online.searchSettings.type.local"})},{value:"ALGOLIA",label:(0,s.hw)({id:"apiDoc.publishSettings.online.searchSettings.type.algolia"})}],[]),{run:v}=(0,n.eB)(async i=>(0,t.yo)({id:e.docsSit
```

### UI-11: English label declarations

The following literal declarations exist in the English locale bundle. A string declaration alone does not establish which screen renders it. The `noContent` row is tied to request history by UI-08; `component.search.noMatch` is a generic label and is not evidence that endpoint search uses it.

| Key | Literal | UTF-16 range |
| --- | --- | --- |
| `mainTreeList.search.searchHistory` | "Search History" | [292889, 292941) |
| `mainTreeList.search.searchHistoryClear` | "Clear" | [292942, 292990) |
| `menu.filter.title` | "Filter" | [52997, 53025) |
| `menu.filters.hide` | "Hide filter" | [53026, 53059) |
| `menu.filters.show` | "Show filter" | [53060, 53093) |
| `menu.filters.clear` | "Clear" | [53094, 53122) |
| `menu.filters.chosen` | "{count} selected" | [53123, 53163) |
| `menu.filters.include` | "Include" | [53164, 53196) |
| `menu.filters.exclude` | "Exclude" | [53197, 53229) |
| `api.label.status` | "Status" | [246030, 246057) |
| `api.label.tags` | "Tags" | [245536, 245559) |
| `api.label.responsible` | "Maintainer" | [246207, 246243) |
| `api.label.creator` | "Creator" | [246177, 246206) |
| `api.label.latestEditor` | "Last modified by " | [246244, 246288) |
| `component.search.noMatch` | "No matching item" | [95886, 95931) |
| `noContent` | "No Content" | [34844, 34868) |
| `requestHistory.mine.title` | "Local" | [612339, 612374) |
| `requestHistory.team.title` | "Shared" | [612375, 612411) |
| `apiDoc.publishSettings.online.searchSettings.type.default.description` | "Search is limited to API names (or titles), URL paths, and tags — not full text." | [459216, 459370) |
| `apiDoc.publishSettings.online.searchSettings.type.default.localSearch.description` | "Local Search builds a full-text index automatically and lets you search all content in your browser." | [459371, 459557) |

## Source identity

| Packed member | SHA-256 | ASAR byte offset |
| --- | --- | --- |
| `dist/renderer/49423.3a17a3ae.async.js` | `de39b99284821a43fc712350b3002565313b299a2c15fd9149ba308a1ef77071` | 43064567 |
| `dist/renderer/90387.c69ddba9.async.js` | `fdcc8c8c7355cde9566682ed0f69ca85de83f9544713792e4326176bed2cc26d` | 82123107 |
| `dist/renderer/73132.0c1a5679.async.js` | `1d283cc9ad30b00b6ed8914390a597a5f3bc23fb3133bb3825e8e37c3e9be239` | 71294508 |
| `dist/renderer/61133.d5ccc339.async.js` | `6ecfc99fb83f152fd55a652169d0b55215912588ff5f149928255383e257fd16` | 59139718 |
| `dist/renderer/6238.515d28a5.async.js` | `fe6ece8f8b7b0f005f6d9ea6926d99dd556040025e74cb2bb102a02f78db5fa2` | 59336403 |
| `dist/renderer/locale.en-US.7f650682917bf2b5.js` | `19507c27895c863fedbbb04bdd949cdd6cb570467fabbc73e71c63ba188f029f` | 102203353 |

## Inferences

- The shared history input and filter bar appear intended to keep repeated project-tree searches quick. This is an interpretation of UI-01 through UI-06, not a timing/performance measurement.
- Request-history double-click appears intended to pin or retain the opened tab because it adds `tabState:"resident"`; the precise lifecycle is not established by the row handler alone.
- Published documentation search, workspace tree search, request-history search, and find-in-page are separate paths. UI-01, UI-04, UI-07, UI-09, and UI-10 directly show distinct data/handlers; the broader product taxonomy is an interpretation.

## Unknowns and boundaries

- No runtime UI screenshot, request capture, or interaction was collected by this sub-investigation.
- Main endpoint keyword matching/ranking, its exact searchable fields, and any workspace-search launch shortcut are intentionally left to the separate algorithm evidence ledger. Ctrl/Cmd+F here must not be relabeled as workspace search.
- The storage wrapper backing `s.wc` was not traced here; this ledger establishes its namespace/key/API calls, not whether the implementation uses localStorage, a file, or another store.
- Generic filter-option search semantics in UI-06 must not be applied to workspace keyword matching.
- Original minified identifiers and snippets are preserved without rewriting. Small fragments may start/end inside a surrounding expression; offsets refer to the original member.
