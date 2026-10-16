# Evidence: Apidog OpenAPI/Swagger import

Static evidence for the clean-room OpenAPI/Swagger import feature in Reqora. Collected 2026-10-16 by literal scanning of packaged JavaScript. No Apidog code was executed. Excerpts are short, verbatim quotes kept only to identify locations. This file does not reproduce larger code blocks.

## Artifact identity

| Item | Value |
| --- | --- |
| Installed ASAR | `C:\Users\Lucas Steffen\AppData\Local\Programs\Apidog\resources\app.asar` |
| Size | 440,675,242 bytes |
| SHA-256 | `bfc70fa7511ec83de76abbf90386f0f881a44aa444792e0f449a3cf3cf9bab64` (recomputed by the scanner; matches `docs/apidog-search/README.md`) |
| App version | Apidog 2.8.50. The build constants in `index.a796567fc5ca9bd8.js` include `f="2.8.50"`, `b="Apidog"`, and `A="apidog"` (see F40). |
| Inventory | `docs/apidog-search/evidence/raw/asar-inventory.json` |
| Scanner | `docs/apidog-import/tools/scan-import-evidence.cjs` writes `docs/apidog-import/evidence/raw/import-evidence-facts.json` (gitignored). That file holds each fact's member byte offset, absolute ASAR byte offset, full excerpt (200 characters or fewer), and anchor occurrence count. |

Members cited (SHA-256 of the member bytes as stored in the ASAR):

| Key | Member path | Size | SHA-256 |
| --- | --- | ---: | --- |
| 94743 | `dist/renderer/94743.05826374.async.js` | 1,833,731 | `ff0478c14a4d5431758f26f5659b02b5f22c2bc5261af80e123ca2d69b580ea0` |
| 20401 | `dist/renderer/20401.291e096a.async.js` | 587,732 | `f1e823b64d616ed56b42501abe60d41ac9d3c4f06a7c173532220862c9c692dd` |
| 97494 | `dist/renderer/97494.27877be7.async.js` | 32,362 | `1caee2a0497b51f385aa5e75e1b78ac47b2090e373fce779ae5cb97516c72440` |
| 11113 | `dist/renderer/11113.3c03cee9.async.js` | 135,257 | `632d7d8d008670ac302ecd4cbb50ba5c63249672e5a58b47d7956c37acdf2872` |
| 89626 | `dist/renderer/89626.5362d10e.async.js` | 55,428 | `46c09c80435999cac898a34cad84ee8de9faa52dac08b55c28cdc290cb8bda4b` |
| index | `dist/renderer/index.a796567fc5ca9bd8.js` | 673,461 | `0c17746dd7932db5400238484aa03aae853dd4a3e95e61f901c8773c225b6105` |
| locale | `dist/renderer/locale.en-US.7f650682917bf2b5.js` | 811,600 | `19507c27895c863fedbbb04bdd949cdd6cb570467fabbc73e71c63ba188f029f` |
| preload | `dist/preload.main-window.js` | 8,774 | `1f6a343b1232e417aed8a766317afe3608624f41c5496236e231b03fea22b8f0` |

Offsets are zero-based UTF-16 code-unit indices into the UTF-8-decoded member. The "Module" column gives the nearest enclosing webpack module ID. It is blank for the locale and preload files. Excerpts start at the anchor and are truncated, and `|` is escaped in tables. The regex in F03 contains a literal U+00A0 (non-breaking space), which displays like an ordinary space.

## Facts

### Format detection and parsing

| ID | Statement | Member | UTF-16 offset | Module | Excerpt |
| --- | --- | --- | ---: | --- | --- |
| F01 | Source-format auto-detection tries JSON.parse first and runs an ordered detector list (OpenAPI first); only if JSON fails does it try SoapUI XML, then YAML when the text contains "openapi"/"swagger". | 94743.05826374.async.js | 1753875 | 960115 | `o=e=>{let t=e.trim();if(!t)return;let r=(0,a.kL)(t);if(r.parsed){for(let[e,t]of i)if(t(r.value))return e;return}if((0,a.Aq)(t))return n.b.So` |
| F02 | A parsed document counts as OpenAPI/Swagger when openapi, swagger, or swaggerVersion is a string. | 94743.05826374.async.js | 1760373 | 131176 | `l=e=>!!a(e)&&("string"==typeof e.openapi\|\|"string"==typeof e.swagger\|\|"string"==typeof e.swaggerVersion),c=e=>a(e)&&Obje` |
| F03 | Converter parse step: JSON.parse, then a retry after removing newline-plus-U+00A0 (non-breaking space) runs, before other formats. | 94743.05826374.async.js | 156743 | 266350 | `r=function(e){try{return JSON.parse(e)}catch(r){try{var t=e.replace(/[\n\|^] +/g,"");return JSON.parse(t)}catch(e){throw(0,f.oV)(SyntaxError(` |
| F04 | After JSON fails, the converter tries XML (xml2js-style parseStringPromise) and then YAML. | 94743.05826374.async.js | 156165 | 266350 | `p().parseStringPromise(t,{tagNameProcessors:[p().processors.stripPrefix],attrNameProcessors:[p().processors.st` |
| F05 | YAML parse failures surface as "Specification is not a valid YAML." with PARSE_ERROR cause. | 94743.05826374.async.js | 155935 | 266350 | `throw(0,f.oV)(SyntaxError("Specification is not a valid YAML. ".concat(e)),i.hW.PARSE_ERROR)}}function C(){ret` |
| F06 | Final parse failure message when JSON, XML and YAML all fail. | 94743.05826374.async.js | 142640 | 983051 | `var n="Invalid format. Input must be in JSON YAML or XML format.",a="Invalid format. Enter a valid OpenAPI or Swagger specification in JSON ` |
| F07 | JSON input: empty requestBody objects on post/patch/put/delete are deleted before conversion. | 94743.05826374.async.js | 157038 | 266350 | `for(var t=["post","patch","put","delete"],n=0;n<t.length;n++){var a,i=t[n],o=null==(a=r.paths[e][i])?void 0:a.requestBody;o&&T(o)&&delete r.` |
| F08 | Version classification uses a version comparison on openapi\|\|swagger\|\|swaggerVersion: >=3.0 openapi_3, >=2.0 swagger_2, >=1.0 swagger_1. | 94743.05826374.async.js | 157931 | 266350 | `if(!(n=r.openapi\|\|r.swagger\|\|r.swaggerVersion)){e.next=13;break}if(!(s()(n,"3.0")>=0)){e.next=9;break}return e.abrupt("return","openapi_3");` |
| F09 | Swagger 2.0 is upgraded to OpenAPI 3 with a swagger2openapi-style convertObj (warnOnly, patch); a non-root basePath is kept as x-basePath without trailing slash. | 94743.05826374.async.js | 159831 | 266350 | `p.convertObj(o,{appNameLower:(0,n.fj)(),warnOnly:!0,patch:!0});case 27:o=e.sent.openapi,d&&"/"!==d&&(o["x-basePath"]=d.replace(/\/$/,"")),e.` |
| F10 | Other legacy versions (e.g. swagger_1) go through a generic converter to openapi_3. | 94743.05826374.async.js | 160322 | 266350 | `v.convert({from:s,to:"openapi_3",source:o});case 39:o=JSON.parse(e.sent.stringif` |
| F11 | After conversion, a document with no version field and no paths is rejected as an invalid converted document. | 94743.05826374.async.js | 69211 | 557427 | `this.contentVersion=(null==(i=a)?void 0:i.openapi)\|\|(null==(o=a)?void 0:o.swagger)\|\|(null==(s=a)?void 0:s.swaggerVersion)\|\|(null==(l=n)?void` |
| F12 | Pre-validation: content lacking openapi/swagger/swaggerVersion/paths (JSON keys or YAML top-level keys) is reported as not an OpenAPI document. | 94743.05826374.async.js | 1315157 | 777172 | `if(r)return!("openapi"in r)&&!("swagger"in r)&&!("swaggerVersion"in r)&&!("paths"in r);let n=/(^\|\n)\s*(openapi\|swagger\|swaggerVersion\|paths` |
| F13 | Accepted OpenAPI file extensions are .json/.yaml/.yml; .html/.htm are rejected. | 94743.05826374.async.js | 1314097 | 777172 | `let c=[".html",".htm"],d=[".json",".yaml",".yml"],u=(e,t)=>E` |
| F14 | HTML files (MIME, extension, or leading doctype/html/body tag) are rejected with the invalidOpenApiHtmlFile message. | 94743.05826374.async.js | 1316060 | 777172 | `if(i.includes("text/html")\|\|c.some(e=>n.endsWith(e))\|\|"string"==typeof(r=t)&&/^\s*<(?:!doctype\s+html\|html\|body)\b/i.test(r))return{kind:"er` |
| F15 | If the content is detected as another supported format (Postman, HAR, ...), the OpenAPI flow offers a reroute instead of failing. | 94743.05826374.async.js | 1314709 | 777172 | `kind:"reroute",detectedFormatLabel:e,targetImportFormat:n,title:(0,a.hw)({id:"import.message.rerouteFromOpenApi.title"},` |

### $ref resolution

| ID | Statement | Member | UTF-16 offset | Module | Excerpt |
| --- | --- | --- | ---: | --- | --- |
| F20 | Internal refs are resolved by a local JSON-pointer walk with ~1/~0 unescaping and URI decoding. | 94743.05826374.async.js | 42022 | 364035 | `{key:"getRefObject",value:function(e,t){if(!e\|\|"string"!=typeof e)return null;var r=e.split("/").slice(1).map(function(e){return decodeURICo` |
| F21 | Internal pointer lookup only accepts refs under components or paths; others log a warning and resolve to null. | 94743.05826374.async.js | 42344 | 364035 | `Error reading ".concat(e,". Can only use references from components and paths")),null;var n=F(t,r);return n?n.$ref?this.` |
| F22 | Chained refs are followed recursively; missing targets warn "ref ... not found." and yield null (no visible cycle guard in this helper). | 94743.05826374.async.js | 42443 | 364035 | `return n?n.$ref?this.getRefObject(n.$ref):n:(console.warn("ref ".concat(e," not found.")),null)}},{key:"getExa` |
| F23 | components.schemas and requestBodies become stored data schemas keyed by their JSON-pointer id; the schema JSON is kept as-is (refs are not inlined). | 94743.05826374.async.js | 76805 | 557427 | `id:"#/components/".concat(r,"/").concat(e),jsonSchema:a,description:c}` |
| F24 | requestBody ref aliases are collapsed through a visited list that stops on cycles. | 94743.05826374.async.js | 77336 | 557427 | `var l=function(e,t){var r=arguments.length>2&&void 0!==arguments[2]?arguments[2]:[],n=t[e];return!r.includes(n)&&(t[t[e]]?(r.push(e),l(t[e],` |
| F25 | YAML-URL imports use a ref replacer that fetches non-# $ref targets relative to the document URL. | 94743.05826374.async.js | 1310750 | 456269 | `async replaceRefs(e,t,r){let n=Array.isArray(e)?[]:{},a=[];for(let s in e){let l=e[s];if("object"==typeof l&&null!==l)if("$ref"in l&&"string` |
| F26 | Fetched external schema files are hoisted into components.schemas under the file name and replaced by an internal ref; other targets are inlined. | 94743.05826374.async.js | 1311060 | 456269 | `` (this.isSchemasUrl(e)\|\|this.isSchemaObject(t))&&r?(n[s]={$ref:`${"#/components/schemas/"+r}`},this.schemas[r]=t):n[s]=t}).catch(e= `` |
| F27 | External ref fetches in the YAML-URL replacer run with concurrency 2. | 94743.05826374.async.js | 1311674 | 456269 | `return await this.concurrencyLimit(a,2),n}async fe` |
| F28 | GitHub blob URLs are rewritten to raw.githubusercontent.com before fetching. | 94743.05826374.async.js | 1310444 | 456269 | `` let t=e.match(/https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)/);if(t&&3===t.length){let e=t[1],r=t[2];return`https://raw.githubuserconten `` |
| F29 | External-ref resolution budget: 200 documents, 0x6400000 bytes (100 MiB), 30 s per request, 300 s total; overridable from localStorage key openApiExternalRefResolutionLimits. | 94743.05826374.async.js | 1765466 | 221234 | `let i={maxDocuments:200,maxTotalBytes:0x6400000,requestTimeoutMs:3e4,totalTimeoutMs:3e5},o=function(e=(()=>{try{return globalThis.localStora` |
| F30 | Budget violations raise ExternalRefResolutionError with reasons documentLimitExceeded/totalBytesExceeded/requestTimeout/totalTimeout/cancelled. | 94743.05826374.async.js | 1766146 | 221234 | `` super({message:`OpenAPI external reference resolution failed: ${e.reason}`,type:"externalRefResolutionFailed",cause:s[e.reason]}),this.name= `` |
| F31 | The source-preparation walker collects only non-fragment $ref strings, using a WeakSet to avoid revisiting objects. | 20401.291e096a.async.js | 452612 | 933703 | `"$ref"!==e\|\|"string"!=typeof t\|\|t.startsWith("#")?m(t):d.push(t)}))},m(c),d);for(let a of(r.assertActive(),h)){let c,d;r` |
| F32 | External refs must be HTTP(S) and same-origin as the root URL; each URL is fetched once (Set of visited hrefs). | 20401.291e096a.async.js | 452927 | 933703 | `throw iB(a,Error("Only same-origin HTTP(S) external refs are supported"));if(!l.has(c.href)){l.add(c` |
| F33 | A redirect that leaves the root origin fails the external ref. | 20401.291e096a.async.js | 453142 | 933703 | `if(t.origin!==o)throw Error("External ref redirected to a different origin");r.recordConte` |

### Tags, paths, folders, names

| ID | Statement | Member | UTF-16 offset | Module | Excerpt |
| --- | --- | --- | ---: | --- | --- |
| F40 | Build constants: appName "Apidog", appNameLower "apidog". | index.a796567fc5ca9bd8.js | 135446 | 169508 | `b="Apidog",A="apidog",v=A.charAt(0).toUp` |
| F41 | Vendor extension keys are derived from the app name: x-<app>-folder, x-<app>-status, x-<app>-name, etc. | 94743.05826374.async.js | 141829 | 822579 | `expandFolderName:"x-".concat(e,"-folder"),expandStatusName:"` |
| F42 | The converter context receives appNameLower, so the folder extension is x-apidog-folder in this build (default fallback in the library is "apifox"). | 94743.05826374.async.js | 1295842 | 914316 | `appName:u.A3,appRegion:u.Gi,mockServerPort:u.JH,formatMessag` |
| F43 | Endpoint folder = operation x-apidog-folder if present, else derived from tags. | 94743.05826374.async.js | 73246 | 557427 | `h=d[N.AppExpendKeys.folder],y=function(){var e=h\|\|N.getFolderName(d.tags);return e?String(e):e}(),e.next=10,m.` |
| F44 | Tag-derived folder uses only the first tag, trimming each slash-separated segment. | 94743.05826374.async.js | 71761 | 557427 | `{key:"getFolderName",value:function(e){if(e&&e.length>0&&"string"==typeof e[0])return e[0]=e[0].split("/").map(function(e){return e.trim()})` |
| F45 | Folder strings split on "/" create every ancestor folder (cumulative prefixes); folders are matched by full path name. | 94743.05826374.async.js | 73813 | 557427 | `(g=y.split("/")).forEach(function(e,t){var n=t>0?$(g,0,t+1).join("/"):e;i.find(function(e){return e.name===n})\|\|i.push(new r({name:n}))})}ca` |
| F46 | A root default folder is created with auth derived from the document-level security. | 94743.05826374.async.js | 72307 | 557427 | `u=new r({name:(0,n.hw)({id:"defaultFolder"}),auth:(0,h.Vu)(t.security),securityScheme:(0,h.k6)({securities:t.security,se` |
| F47 | Operations with no folder (no extension, no tags) go into the default root folder. | 94743.05826374.async.js | 74120 | 557427 | `}else u.addItem(v.apiDetail);c` |
| F48 | Methods are lowercased and de-duplicated per path item. | 94743.05826374.async.js | 73150 | 557427 | `if(f=n.toLowerCase(),!p.has(f)){e.next=5;break}return e.abru` |
| F49 | additionalOperations (OAS 3.2) are imported only for known methods; others warn and are skipped. | 94743.05826374.async.js | 74857 | 557427 | `[OpenAPI] Unsupported HTTP method "'.concat(S,'" in additionalOperations at path ').concat(a,". ")+"This custom method will be skipped. Cons` |
| F50 | Both paths and webhooks are converted (webhooks flagged as type webhook). | 94743.05826374.async.js | 72210 | 557427 | `o=t.paths,s=t.webhooks,l={},c=` |
| F51 | After tree building, each folder keeps only its last path segment as display name. | 94743.05826374.async.js | 83484 | 557427 | `{key:"formatFolderName",value:function(e){var t=this;e.forEach(function(e){var r=e.name.split("/");r.length>1&&(e.name=r.pop()),e.children.l` |
| F52 | Endpoint name = summary, then operationId / description first line / path depending on apiNameExtractMethod; truncated to 255 chars. | 94743.05826374.async.js | 41734 | 364035 | `{key:"handleApiName",value:function(e,t){var r,n,i=e.summary,o=e.operationId,s=e.description,l=s?(0,u.T9)(s):"";switch(this.apiNameExtractMe` |
| F53 | All operation tags are kept as endpoint tags; deprecated maps to status; operationId is retained. | 94743.05826374.async.js | 40370 | 364035 | `P.tags=e.tags,P.status=e.deprecated?s.pQ.deprecated:e[d.expansionKeys.expandStatusName],P.operationId=e.operationId,P.cu` |
| F54 | Schemas default to a "Schemas" folder unless the schema carries x-apidog-folder. | 94743.05826374.async.js | 76948 | 557427 | `switch(r){case"schemas":default:l="Schemas";break;case"responses":l="Response";break;case"requestBodies":l="RequestBodie` |
| F55 | Each servers[] entry becomes an environment candidate named by description or URL. | 94743.05826374.async.js | 75862 | 557427 | `e.url&&r.push(new t({baseUrls:{default:e.url},name:e.description\|\|e.url,variable` |
| F56 | info.title becomes the module/import title. | 94743.05826374.async.js | 70545 | 557427 | `name:(null==(t=n)\|\|null==(t=t.info)?void 0:t.title)\|\|"",description:nu` |

### URL import transport

| ID | Statement | Member | UTF-16 offset | Module | Excerpt |
| --- | --- | --- | ---: | --- | --- |
| F60 | URL fetch transport is chosen in the renderer: desktop builds use the in-renderer HTTP client; web uses another path. | 94743.05826374.async.js | 1755006 | 688826 | `a=n.xl?await (0,l.A)(e,t,{...r,requestAttemptTransport:"desktop"}):await (0,u.A)(e,t,r)},b=e=>{if(e?.aborted)t` |
| F61 | The desktop client is an axios-style instance created in the renderer: accepts 2xx and 401, sends no-cache headers, no timeout configured in this module. | 94743.05826374.async.js | 1746296 | 141355 | `o.defaults.validateStatus=e=>e>=200&&e<300\|\|401===e,o.defaults.headers.common={"Cache-Control":"no-cache",Pragma:"no-cache",Expires:"0"};let` |
| F62 | For OpenAPI URL imports a swagger-ui.html URL is rewritten to /v2/api-docs. | 94743.05826374.async.js | 1756670 | 688826 | `t=e.replace(/\/swagger-ui\.html([#\|?].*)?$/,"/v2/api-docs"),n=RegExp("^.+https?://.*","g")` |
| F63 | If an OpenAPI URL returns HTML, the first body a[href] is followed; otherwise origin/openapi.json and origin/v2/swagger.json are probed. | 94743.05826374.async.js | 1755188 | 688826 | `` let r=new URL(e).origin,n=`${r}/openapi.json`,a=`${r}/v2/swagger.json`;try{let e `` |
| F64 | 401/403 map to an authorization error; >=400 to "Request failed with status N". | 94743.05826374.async.js | 1757485 | 688826 | `if(401===l.status\|\|403===l.status)throw new d.Yw({message:(0,a.hw)({id:"import.message.authorizeError"}),type:"authorizationRequired",cause:` |
| F65 | Desktop builds derive a second URL with needIgnoreCertificate=<type>; the fetch helper tries the original URL first and the processed URL only after a failure. | 94743.05826374.async.js | 1756821 | 688826 | `` let M=r;m&&n.xl&&(r+=`${r.includes("?")?"&":"?"}needIgnoreCertificate=${m}`);try{b(x),l=await g(M,r,_)}catch(e){throw(0, `` |
| F66 | file:// URLs and local paths in the URL field are rejected (file import must be used). | 94743.05826374.async.js | 1756276 | 688826 | `throw new d.Yw({message:(0,a.hw)({id:"import.message.localFileNotSupportedInWeb"}),cause:p.hW.URL_FETCH_NETWOR` |
| F67 | OpenAPI URL precheck requires http(s); URLs ending in .html/.htm (except swagger-ui.html) are rejected. | 94743.05826374.async.js | 1315565 | 777172 | `if(!/^https?:\/\//i.test(n))return u((0,a.hw)({id:"import.message.invalidOpenApiUrlProtocol"}),s.hW.URL_FETCH_NETWORK_ER` |
| F68 | The import dialog treats URLs containing swagger/openapi/api-docs or ending .yaml/.yml as OpenAPI (YAML URLs use the ref replacer). | 20401.291e096a.async.js | 571479 | 463389 | `x=/(?:swagger\|openapi\|api-docs)\|\.ya?ml(?:[?#]\|$)/i.test(y);try{let e,` |
| F69 | Network errors whose message contains "timeout" are reported as networkTimeout plus checkUrlAccessError. | 94743.05826374.async.js | 1001095 | 940548 | `` g.includes("timeout")?`${(0,i.hw)({id:"import.message.networkTimeout"})} ${(0,i.hw)({id:"import.message.checkUrlAccessEr `` |
| F70 | Response-size guard compares content-length (and measured body) against an optional maxResponseBytes. | 94743.05826374.async.js | 1768805 | 418870 | `if("number"==typeof t&&void 0!==n&&n>t)return n;let a=e.body,i=e.request?.responseText,o=[n,(e=>{if("string"==typeof e)r` |
| F71 | The only file-related preload channel observed is a generic dialog invoke (electronAPI.dialog.showOpenDialog); no import/fetch-specific channel was found. | preload.main-window.js | 237 | — | `d="electronAPI:dialog:showOpen",s="elect` |

### File / drag-and-drop ingress and conversion location

| ID | Statement | Member | UTF-16 offset | Module | Excerpt |
| --- | --- | --- | ---: | --- | --- |
| F75 | Dropped/selected files: dot-files are ignored; more than one file (outside folder mode) is rejected. | 20401.291e096a.async.js | 573656 | 463389 | `let i=e.filter(e=>!e.name.startsWith("."));if(!t&&i.length>1){eq.precheck(!1,{errorType:d.` |
| F76 | Local file import size cap is 0xc800000 bytes (200 MiB); the message is rendered with maxSize:200. | 20401.291e096a.async.js | 562140 | 463389 | `tC=0xc800000,tS=(e,t` |
| F77 | Files are read in the renderer with FileReader.readAsText. | 20401.291e096a.async.js | 574538 | 463389 | `let i=new FileReader;i.onload=()=>e("string"==typeof i.result?i.result:""),i.onerror=()=>t(i.error??Error("Una` |
| F78 | The import dialog has a hidden file input and a hidden folder input (webkitdirectory). | 20401.291e096a.async.js | 552028 | 463389 | `webkitdirectory:"",directory:"",onChange` |
| F79 | Drop handling walks DataTransfer entries (directories via createReader/readEntries). | 20401.291e096a.async.js | 551285 | 463389 | `let t=e.webkitGetAsEntry?.();return t?[t]:[]});if(!t.length)` |
| F80 | OpenAPI/Swagger format supports URL import, basic auth, and Git import; it does not declare folder import. | 94743.05826374.async.js | 1297414 | 914316 | `label:"OpenAPI/Swagger",value:c.b.OpenApi.valueOf(),Convertor:sM(c.b.OpenApi.valueOf()),supportUrlImport:!0,supportBasicAuth:!0,supportGitIm` |
| F81 | Conversion is dispatched in-process in the renderer by format name. | 94743.05826374.async.js | 1293482 | 914316 | `case"openapi":return new nG(t,r);case"po` |
| F82 | Spec-mode OpenAPI import uses a drag-and-drop dragger with a select-file button. | 97494.27877be7.async.js | 19688 | 285994 | `"data-testid":"openapi-import-dragger","data-drag-active":w,` |
| F83 | Spec-mode import parses JSON then YAML and stores the raw file (versions 2.0 / 3.0.x / 3.1.x recognized). | 97494.27877be7.async.js | 994 | 133350 | `function p(e){try{return JSON.parse(e)}catch{return i.Ay.load(e)}}func` |

### Re-import, preview, commit

| ID | Statement | Member | UTF-16 offset | Module | Excerpt |
| --- | --- | --- | ---: | --- | --- |
| F90 | Endpoint overwrite mode options: methodAndPath (Overwrite), merge, OVERWRITE_SELECTED_FIELDS (OpenAPI only), ignore, both; importAsEndpointCase is Postman-only. | 20401.291e096a.async.js | 285991 | 454239 | `(0,i.jsx)(rs,{value:"methodAndPath",children:(0,o.hw)({id:"importData.api.overwriteMode.cover"})}),(0,i.jsxs)(rs,{value:"merge",children:[(0` |
| F91 | Default endpoint overwrite mode is methodAndPath; the last used mode is remembered; OVERWRITE_SELECTED_FIELDS falls back for non-OpenAPI formats. | 20401.291e096a.async.js | 280622 | 454239 | `let ro="methodAndPath";function rl({currentBranchId:e,importFormat:t}){if(e!==(0,f.sI)())return ro;let r=(0,f._g)();return"OVERWRITE_SELECTE` |
| F92 | Manual import defaults: deleteUnmatchedResources false; docOverwriteMode name; apiNameExtractMethod OPERATION_ID. | 20401.291e096a.async.js | 283131 | 454239 | `deleteUnmatchedResources:!1,apiOverwriteMode:rl({currentBran` |
| F93 | Security import defaults: importSecurityScheme true; securityAuthMode "security"; noSecurityAuthMode "inherit". | 20401.291e096a.async.js | 283383 | 454239 | `importSecurityScheme:!0,setProjectAuthAsRootSecurity:(0,tg.U` |
| F94 | Folder-level identity UI offers methodAndPath, methodAndPathAndFolder, ignore, and (for importData) both; labels depend on the identity pattern type (methodAndPath, operationId, query, header, body). | 20401.291e096a.async.js | 244527 | 433633 | `` {value:"methodAndPathAndFolder",label:(0,n.hw)({id:`${t}.api.overwriteMode.${e}.path`},{fieldName:i})},{value:"ignore",l `` |
| F95 | Preview is a checkable virtual tree; only checked keys are kept in the submitted specification. | 20401.291e096a.async.js | 347551 | 454239 | `checkable:!0,checkStrictly:!0,autoExpandParent:!0,treeData:s,checkedKeys:h,defau` |
| F96 | The converted import payload must be under 100 MB (JSON blob size) unless a build flag disables the check. | 20401.291e096a.async.js | 366014 | 454239 | `return t/1048576<100}catch(e){` |
| F97 | Commit sends the converted specification plus all mode options (overwrite modes, folders, syncApiFolder, deleteUnmatchedResources, security options) in one request. | 20401.291e096a.async.js | 366630 | 454239 | `tI({importFormat:V,importFullPath:w,importEnvironment:te(e,Q),basePath:C?eR:void 0,apiFolderId:A,schemaFolderId:y,reques` |
| F98 | The commit endpoint is POST /api/v1/import-data on the Apidog backend. | index.a796567fc5ca9bd8.js | 442981 | 189840 | `n.Ay.post("/api/v1/import-data",{...s,data:e,getResponse:!0,errorHandler:e=>(c=!` |
| F99 | Result table columns: Type, Created, Updated, plus No Change and Ignored only when non-zero. | 89626.5362d10e.async.js | 50788 | 209539 | `{title:(0,o.hw)({id:"importData.result.create"}),dataIndex:"createCount",width:100},{title:(0,o.hw)({id:"importData.result.update"}),dataInd` |
| F100 | Scheduled auto-import (data source binding) has the same mode fields plus interval 180 and deleteUnmatchedResources false by default. | 11113.3c03cee9.async.js | 113015 | 168601 | `apiOverwriteMode:(t=(0,J.$c)(),t?t:"methodAndPath"),schemaOverwriteMode:(i=(0,J.uQ)(),i?i:"name"),docOverwriteMode:"name",apiFolderId:0,sche` |

### Security schemes

| ID | Statement | Member | UTF-16 offset | Module | Excerpt |
| --- | --- | --- | ---: | --- | --- |
| F110 | components.securitySchemes are converted into security-scheme records (default folder unless x-apidog-folder). | 94743.05826374.async.js | 78683 | 557427 | `{key:"convertSecurityScheme",value:function(e){var t=this,r=a.baseContainer.getItemsSync(function(e){return[e.collection` |
| F111 | Each scheme keeps the original OAS object (authConfigs) and type, plus a derived authType (apikey, bearer, awsv4, hawk, edgegrid, ...). | 94743.05826374.async.js | 79375 | 557427 | `authType:t.formatAuthType(r),oasAuthType:r.type,authConfigs:r})):a=d.c` |

### en-US locale strings

| ID | Statement | Member | UTF-16 offset | Module | Excerpt |
| --- | --- | --- | ---: | --- | --- |
| L01 | Overwrite mode labels: Overwrite, Merge, Ignore, Keep Both. | locale.en-US.7f650682917bf2b5.js | 418612 | — | `"importData.overwriteMode.cover":"Overwrite","importData.overwriteMode.merge":"Merge","importData.overwriteMode.ignore":"Ignore","importData` |
| L02 | Merge keeps modified Mock, Description, Request/Response Examples. | locale.en-US.7f650682917bf2b5.js | 420377 | — | `"importData.api.overwriteMode.mergeTip":"Keep the modified Mock, Description, Request Example, Response Example, etc.","` |
| L03 | Overwrite Selected Fields option and tip. | locale.en-US.7f650682917bf2b5.js | 418859 | — | `"importData.overwriteMode.overwriteSelectedFields":"Overwrite Selected Fields","importData.overwriteMode.overwriteSelectedFields.tip":"Selec` |
| L04 | method & path matching phrasing (ignore / overwrite / keep both / and folder). | locale.en-US.7f650682917bf2b5.js | 420496 | — | `"importData.api.overwriteMode.methodAndPath.ignore":"Ignore when same method & path","importData.api.overwriteMode.methodAndPath.name":"Over` |
| L05 | Folder sync choice when the same endpoint lives in a different folder. | locale.en-US.7f650682917bf2b5.js | 441569 | — | `"importData.api.syncFolder.title":"When the same endpoint is in different folders","importData.api.syncFolder.false.title":"Keep the existin` |
| L06 | Delete-unmatched choice text. | locale.en-US.7f650682917bf2b5.js | 441956 | — | `"importData.deleteUnmatchedResources.title":"Whether to delete resources that no longer exist in the data source","importData.deleteUnmatche` |
| L07 | Result labels Created / Updated / No Change / Ignored. | locale.en-US.7f650682917bf2b5.js | 425323 | — | `"importData.result.create":"Created","importData.result.update":"Updated","importData.result.noChange":"No Change","impo` |
| L08 | Preview modal title and tab. | locale.en-US.7f650682917bf2b5.js | 439203 | — | `"import.importFormatDetailModal.title":"Import Preview & Configuration","import.importFormatDetailModal.preview.tab.title":"Preview & Select` |
| L09 | Supported OpenAPI versions statement. | locale.en-US.7f650682917bf2b5.js | 426126 | — | `"manualImport.OpenAPITips":"OpenAPI 3.0/3.1 / Swagger 2.0 (JSON or YAML) are supported.","` |
| L10 | File size error text. | locale.en-US.7f650682917bf2b5.js | 432181 | — | `"importV2.error.fileTooLarge":"The source is too large to import. The total size must not exceed {maxSize} MB.","importV` |
| L11 | Not-an-OpenAPI-document error text. | locale.en-US.7f650682917bf2b5.js | 433858 | — | `` "import.message.notOpenApiDocument":"We couldn’t find a valid OpenAPI or Swagger specification in this file. Make sure it includes `openapi` `` |
| L12 | External-ref document limit text. | locale.en-US.7f650682917bf2b5.js | 517901 | — | `"projectImport.maintenanceMode.sourcePreparation.documentLimit.description":"This OpenAPI contains more than {limit} referenced files. Merge` |
| L13 | Security import option text. | locale.en-US.7f650682917bf2b5.js | 438508 | — | `"importData.securityScheme.securityAuthMode":"For imported endpoints with security defined, set Auth to:","importData.se` |
| L14 | Endpoint name extraction option text. | locale.en-US.7f650682917bf2b5.js | 419900 | — | `"importData.api.name.extract.method":"When the endpoint Summary field is empty, what should be used as the endpoint name first?","` |
| L15 | basePath-from-servers option text. | locale.en-US.7f650682917bf2b5.js | 442285 | — | `"importData.api.importBasePath.openapi":"Add the basePath from Servers to the front of the endpoint path (not recommended)","impor` |
| L16 | HTTP error text for URL import. | locale.en-US.7f650682917bf2b5.js | 431473 | — | `"importV2.error.http":"Unable to access this URL ({statusCode}). Check the URL and try again.","impo` |
| L17 | operationId identity phrasing. | locale.en-US.7f650682917bf2b5.js | 420939 | — | `"importData.api.overwriteMode.operationId.name":"Overwrite only when same operat` |

## Inferences

These are interpretations of the facts above. They are not proven by static analysis.

- **I1. Format detection (Q1).** OpenAPI/Swagger is recognized by a top-level `openapi`, `swagger`, or `swaggerVersion` string (F01, F02, F12). The converter tries parsers in this order: JSON, then whitespace-relaxed JSON, then XML, then YAML (F03–F06). The version is classified by numeric comparison (F08). Swagger 2.0 is upgraded to OAS 3 before any further processing, and the Swagger `basePath` is preserved as `x-basePath` (F09). OAS 3.0 and 3.1 go to one converter, and only legacy versions are routed through a generic converter (F10). The import UI states support for "OpenAPI 3.0/3.1 / Swagger 2.0 (JSON or YAML)" (L09).
- **I2. Internal `$ref` handling (Q2).** Apidog does **not** fully dereference the document. Component schemas and request bodies become stored reusable schemas keyed by their JSON pointer (F23, F54), so recursive schemas naturally survive as references. Parameters and examples are looked up on demand with a small JSON-pointer resolver restricted to `components`/`paths` (F20–F22). That resolver follows `$ref` chains recursively without a visible cycle guard. Only the request-body alias map has an explicit cycle stop (F24). No general-purpose `$RefParser.dereference` call was found on the OpenAPI conversion path. Such libraries do appear in other chunks (for example `76934`), but they are not linked to this path.
- **I3. External `$ref` handling (Q2).** There are two mechanisms. (a) For a YAML URL, a recursive replacer fetches each non-fragment `$ref` relative to the document URL, two at a time. Fetched schema files are hoisted into `components.schemas/<fileName>`, and other fetched targets are inlined (F25–F28). (b) The source-preparation walker accepts only same-origin HTTP(S) references. It fetches each URL once and rejects cross-origin redirects (F31–F33). It works under a budget of 200 documents, 100 MiB total, 30 s per request, and 5 min total (F29, F30, L12). Local-file imports accept a single file and do not declare folder support for OpenAPI (F75, F80). Relative file references in local imports therefore appear to be left unresolved.
- **I4. Folder mapping (Q3).** An endpoint's folder comes from its operation-level `x-apidog-folder` if present (F40–F43). Otherwise it comes from the **first tag only** (F44). Each slash-separated segment is trimmed, every ancestor prefix becomes a folder (F45), and each folder displays its last segment (F51). Untagged operations go to a root "default folder" that carries the document-level security as its auth (F46, F47). All tags are still stored on the endpoint (F53). Methods are de-duplicated case-insensitively per path. Webhooks are imported, and non-standard `additionalOperations` methods are skipped with a warning (F48–F50). Schemas go to a "Schemas" folder unless they carry their own `x-apidog-folder` (F54). Endpoint names come from `summary`, then from `operationId`, the first line of `description`, or the path, depending on a setting that defaults to `OPERATION_ID`. Names are capped at 255 characters (F52, F92, L14).
- **I5. URL import transport (Q4).** URL fetching happens **in the renderer** through an axios-style client, even on desktop (F60, F61). No dedicated preload/IPC import method was found. The only related preload channel is the generic `electronAPI:dialog:showOpen` (F71). The root request has no explicit timeout or redirect limit in the inspected code: redirects are followed by the HTTP stack, and the effective URL is read from the response (F33, F65). An explicit timeout (30 s per reference) exists only on the external-reference path (F29). Notable conveniences are the `swagger-ui.html`→`/v2/api-docs` rewrite, discovery of HTML landing pages (first link, then `/openapi.json`, then `/v2/swagger.json`), raw GitHub URL rewriting, and basic auth. A desktop-only certificate-ignore retry uses a query flag (F28, F62–F65, F80). Errors are mapped to auth, HTTP status, network/timeout, or not-OpenAPI messages (F64, F66, F67, F69, L11, L16).
- **I6. Re-import behavior (Q5).** Conversion runs entirely client-side (F81). The user then selects items in a checkable preview tree (F95, L08). Apidog's **server** applies matching and merging: the client sends the full converted payload and all mode options to `POST /api/v1/import-data` (F97, F98), and the per-type result counts come back as Created / Updated / No Change / Ignored (F99, L07). The endpoint modes are:
  - Overwrite (`methodAndPath`, the default and remembered across imports)
  - Merge, which keeps modified mock data, descriptions, and examples
  - Overwrite Selected Fields (OpenAPI only)
  - Ignore
  - Keep Both

  Endpoint matching uses the endpoint's identity pattern, which defaults to method and path. Alternatives are operationId, or method and path plus a query, header, or body field. Folder-scoped matching is also offered (F90, F91, F94, L01–L04, L17). Further options are "update endpoint folder when it differs" (`syncApiFolder`), "delete resources not in the data source" (default off), "add basePath from servers" (default off), and security-scheme import (F92, F93, L05, L06, L15). The preview UI shows counts per tab but no visible create/update diff status, so the diff is likely computed only on the server.
- **I7. Security schemes (Q6).** `components.securitySchemes` become standalone security-scheme records that keep the raw OAS object and add a derived auth type (F110, F111). Swagger 2 `securityDefinitions` reach this path after the swagger2openapi upgrade (F09). Document-level `security` becomes the root folder's auth (F46). Import options decide whether endpoints with or without `security` use the matching scheme or inherit (F93, L13).
- **I8. Ingress (Q7).** File picking and drag-and-drop use the browser APIs in the renderer: hidden file and folder inputs, DataTransfer entry walking, and FileReader (F75–F79). Limits are 200 MiB total for files (F76, L10) and 100 MB for the converted payload (F96). Spec-mode import is a separate flow that uses a dragger and stores the raw file after JSON-then-YAML parsing (F82, F83).

## Implications for Reqora

Mirror:

- Accept OpenAPI 3.0/3.1 and Swagger 2.0, in JSON or YAML. Detect them by a string `openapi`/`swagger` field and pre-reject HTML or non-OpenAPI content with specific messages (F12–F14, L11).
- Upgrade Swagger 2.0 to OAS 3 first. Preserve `basePath` and `securityDefinitions` through that upgrade.
- Build folders from `x-apidog-folder` (and optionally a Reqora-specific `x-reqora-folder`), then from the first tag, using slash-separated nested folders and trimmed segments. Send untagged operations to a root/default folder. Keep all tags as metadata.
- Name endpoints with `summary`, then `operationId`, then the first line of `description`, then the path, capped at 255 characters.
- Keep component schemas as reusable referenced schemas instead of fully dereferencing them. This handles recursion naturally.
- Show a preview with counts per type and selectable items before committing. Report Created / Updated / No Change / Ignored after commit.
- Use these update modes: overwrite, merge, ignore, and keep both, matched by method and path, with a "delete unmatched" option that defaults to off. Keep folder sync as an explicit choice.
- Keep `securitySchemes` and the document-level `security` for feature 4.

Deliberately differ (already reflected in `specs.md`):

- Fetch URLs and read files in Electron **main** through named preload methods. Apidog fetches in the renderer.
- Use much tighter bounds: 5 MiB per document, a 10 s timeout that includes the body, at most 5 redirects, and validation of every redirect. Apidog allows 200 MiB per file, and its root fetch has no visible timeout or redirect cap.
- Resolve external references for **both** local files (scoped to the selected file's directory) and HTTP sources. Apidog handles only HTTP/YAML-URL cases. Never allow HTTP sources to reference local files.
- Detect cycles explicitly in every reference walker and warn.
- Plan the merge locally, in the domain layer. Apidog does this on its server. Reqora has no backend.
- Leave out the certificate-ignore query flag, GitHub/HTML discovery heuristics, XML parsing, and legacy Swagger 1.x/RAML support. These are optional later additions.

## Limits

- Static reading proves that code and strings exist. It does not prove which branches run at runtime, which feature flags are active, or that the shipped UI exposes every option seen in code.
- Matching, merging, and "delete unmatched" are applied by the Apidog backend (`/api/v1/import-data`). Their exact semantics, such as merge field precedence, `methodAndPathAndFolder` details, and identity pattern evaluation, cannot be observed in the client.
- Main-process logic is mostly V8 bytecode (`*.jsc`). A main-side handler for `needIgnoreCertificate` or the network stack cannot be ruled out.
- Redirect behavior of the root URL fetch depends on the Chromium networking stack. The inspected code sets no explicit redirect cap.
- `x-apidog-folder` is inferred from the key builder (F41) together with the appNameLower constant (F40, F42). The library fallback is `apifox`, and no literal `x-apidog-folder` string exists in the renderer.
- Webpack module IDs are the nearest preceding `id:function(` header. They are reliable for these minified chunks but were not cross-checked against a module map.
